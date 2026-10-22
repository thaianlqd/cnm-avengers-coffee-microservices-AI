"""P6: real resolver/compiler/execution, independent population oracle, no I/O."""
from copy import deepcopy
from unittest.mock import Mock, patch
from types import SimpleNamespace
from fastapi import HTTPException
from common import AiWorkspaceRevisionRequest
from services.analysis_catalog import AnalysisError
from services.analysis_quality_service import verify_saved_report
from services.session_service import get_session
from evals.rich_fixture import rich_world, order_rate_oracle
from tests.test_ai_final_depth_contract import DepthReportMixin
from tests import test_hybrid_v28 as f


class WorkspaceRevisionTests(DepthReportMixin, f.unittest.TestCase):
    def initial(self, metric='order_cancellation_rate', dims=()):
        self.data = rich_world()
        req = f.requirement(domain_id='orders', metric_ids=[metric], dimension_ids=list(dims),
            analysis_kind='aggregate', ranking=None, derived_features=[] if dims else ['scalar'],
            filters=[], time={'kind':'range','start':'2026-09-01','end':'2026-09-30'})
        p, _, report = self.report(req, 'Phân tích ' + self.catalog.registry['metrics'][metric]['business_name'] + ' tháng 9 năm 2026',
                                  self.data, analysis_depth='focused')
        p.provider = Mock(side_effect=AssertionError('Provider forbidden for BI interactions'))
        self.p = p
        return report

    def request_for(self, report, **updates):
        c = report['interaction_contract']
        return AiWorkspaceRevisionRequest(session_id=report['session_id'], revision=report['revision'],
            catalog_fingerprint=c['catalog_fingerprint'], access_fingerprint=c['access_fingerprint'],
            analysis_depth=report['analysis_breadth'], **updates)

    def selection(self, report, dimension):
        entry = next(c for c in report['interaction_contract']['charts'] if c['dimension_id'] == dimension)
        return entry['options'][0]['selection']

    def test_filter_recompiles_ratio_on_full_population_without_provider(self):
        r = self.initial()
        selection = self.selection(r, 'store_id')
        value = selection['values'][0]['value']
        p = self.pipeline(executor=self.p.executor)
        p.provider = Mock(side_effect=AssertionError('provider'))
        cohort = [o for o in self.data['don_hang'] if o['co_so_ma'] == value and o['trang_thai_don_hang'] in {'DA_HUY','HOAN_THANH'}
                  and '2026-09-01' <= o['ngay_tao'][:10] <= '2026-09-30']
        expected = round(100 * sum(o['trang_thai_don_hang']=='DA_HUY' for o in cohort) / len(cohort), 2)
        for depth in ('focused','deep','comprehensive'):
            request=self.request_for(r,filters=[selection]).model_copy(update={'analysis_depth':depth})
            changed = p.workspace_revision(request)
            q = next(q for q in changed['analytical_queries'] if q['role'] == 'requested')
            self.assertEqual((q['time']['start'],q['time']['end']),('2026-09-01','2026-09-30'))
            self.assertAlmostEqual(changed['result_sets'][q['id']]['rows'][0]['order_cancellation_rate'], expected, places=2)
            self.assertTrue(any(sum(row['terminal_order_count'] for row in changed['result_sets'][query['id']]['rows'])==len(cohort)
                for query in changed['analytical_queries'] if 'terminal_order_count' in query['metrics'] and not query['ranking']))
            self.assertEqual(changed['revision'], r['revision'] + 1)
            self.assertEqual(changed['quality_assessment']['status'], 'verified')
            self.assertEqual(verify_saved_report(changed, self.catalog), changed['quality_assessment'])
            self.assertLessEqual(len(changed['analytical_queries']), 8)
            r=changed
        p.provider.assert_not_called()

    def test_numerator_partition_is_inspect_only_not_a_population_filter(self):
        r = self.initial()
        entry = next(c for c in r['interaction_contract']['charts'] if c['dimension_id'] == 'order_status')
        self.assertEqual(entry['selection_behavior'], 'inspect_only')
        with self.assertRaises(AnalysisError) as error:
            self.p.workspace_revision(self.request_for(r, filters=[entry['options'][0]['selection']]))
        self.assertEqual(error.exception.category, 'query_scope')

    def test_forged_value_type_scope_and_stale_revision_fail_closed(self):
        r = self.initial()
        selection = self.selection(r, 'store_id')
        for update in ({'revision':999}, {'access_fingerprint':'forged'},
                       {'filters':[dict(selection, values=[dict(type='string',value='outside-scope')])]},
                       {'filters':[dict(selection, values=[dict(type='number',value=True)])]}):
            # Parse hostile payload exactly as HTTP would.
            with self.assertRaises((AnalysisError, ValueError)):
                self.p.workspace_revision(AiWorkspaceRevisionRequest.model_validate({**self.request_for(r).model_dump(),**update}))
        self.assertEqual(get_session(r['session_id']).revision, r['revision'])

    def test_failed_execution_does_not_publish_or_mutate_source_session(self):
        r = self.initial()
        source = get_session(r['session_id'])
        before = deepcopy(source.report_response)
        p = self.pipeline(executor=Mock(side_effect=AnalysisError('execution','query timed out')))
        with self.assertRaises(AnalysisError):
            p.workspace_revision(self.request_for(r, filters=[self.selection(r,'store_id')]))
        self.assertEqual(get_session(r['session_id']).report_response, before)
        self.assertEqual(get_session(r['session_id']).revision, r['revision'])

    def test_metadata_drill_back_reset_preserve_parent_scope(self):
        r = self.initial('revenue', ['city'])
        selection = self.selection(r,'city')
        changed = self.p.workspace_revision(self.request_for(r, drill_path=[dict(selection=selection,target_dimension_id='store')]))
        requested = [q for q in changed['analytical_queries'] if q['role']=='requested']
        self.assertTrue(all('store' in q['group_by'] for q in requested))
        self.assertTrue(all(dict(dimension='city',operator='eq',value=selection['values'][0]['value']) in q['filters'] for q in requested))
        self.assertEqual(changed['quality_assessment']['status'],'verified')
        reset = self.p.workspace_revision(self.request_for(changed))
        self.assertEqual(reset['interaction_state'], dict(filters=[],drill_path=[]))
        self.assertTrue(all('city' in q['group_by'] for q in reset['analytical_queries'] if q['role']=='requested'))
        self.assertEqual(reset['quality_assessment']['status'],'verified')

    def test_tampered_saved_filter_is_not_scored(self):
        r = self.initial()
        changed = self.p.workspace_revision(self.request_for(r, filters=[self.selection(r,'store_id')]))
        changed['interaction_state']['filters'][0]['values'][0]['value'] = 'tampered'
        self.assertEqual(verify_saved_report(changed,self.catalog)['status'],'not_scored')

    def test_permission_denied_cannot_fallback_to_global_report(self):
        r = self.initial()
        p = self.pipeline(executor=Mock(side_effect=AssertionError('Access denied before SQL')))
        p.owner_id = 'different-account'
        with self.assertRaises(AnalysisError) as error:p.workspace_revision(self.request_for(r))
        self.assertEqual(error.exception.category,'session')
        p.executor.assert_not_called()
        self.assertEqual(get_session(r['session_id']).revision,r['revision'])

    def test_revoke_during_revision_prevents_atomic_publication(self):
        from services.access_policy import active_principal
        revoked=False
        def execute(sql,**kwargs):
            nonlocal revoked
            result=self.p.executor(sql,**kwargs);revoked=True
            return result
        principal=SimpleNamespace(access_fingerprint='fixture-access',national=True,store_ids=[],policy_version='fixture',
            bound_owner='owner-a',expires_at=4000000000,permits=lambda *args:True)
        def current(**kwargs):
            if revoked:raise HTTPException(403,'revoked')
            return principal
        token=active_principal.set(principal)
        try:
            with patch('services.access_policy.current_principal',side_effect=current):
                r=self.initial();before=deepcopy(get_session(r['session_id']).report_response)
                p=self.pipeline(executor=execute)
                with self.assertRaises(HTTPException) as error:p.workspace_revision(self.request_for(r))
                self.assertEqual(error.exception.status_code,403)
        finally:active_principal.reset(token)
        self.assertEqual(get_session(r['session_id']).report_response,before)

    def test_save_reopen_refresh_preserve_snapshot_and_reject_revision_substitution(self):
        from routers.reports import _authoritative_report
        r=self.initial()
        refreshed=self.p.workspace_revision(self.request_for(r,refresh=True))
        self.assertEqual(refreshed['revision'],r['revision']+1)
        self.assertEqual(r['revision'],1)
        with patch('routers.reports._principal',return_value=SimpleNamespace(bound_owner='owner-a')), \
             patch('services.analysis_pipeline.AnalysisPipeline.catalog',return_value=self.catalog), \
             patch('services.access_policy.current_principal',return_value=SimpleNamespace()):
            with self.assertRaises(HTTPException) as error:_authoritative_report(r)
            self.assertEqual(error.exception.status_code,409)
            saved=_authoritative_report(refreshed)
        self.assertEqual(saved['interaction_state'],refreshed['interaction_state'])
        self.assertEqual(saved['provenance'],refreshed['provenance'])
        self.assertEqual(saved['charts'],refreshed['charts'])
        self.assertEqual(verify_saved_report(saved,self.catalog),refreshed['quality_assessment'])

    def test_non_ai_filter_drill_depth_refresh_visual_save_reopen_send_zero_provider_requests(self):
        from common import AiReportRefineRequest
        r=self.initial('revenue',['city'])
        p=self.pipeline(executor=self.p.executor)
        with patch('requests.sessions.Session.request',side_effect=AssertionError('non-AI transport')) as physical:
            p.provider=Mock(side_effect=AssertionError('non-AI provider'))
            s=self.selection(r,'city')
            drilled=p.workspace_revision(self.request_for(r,drill_path=[dict(selection=s,target_dimension_id='store')]))
            reset=p.workspace_revision(self.request_for(drilled))
            s=self.selection(reset,'city')
            request=self.request_for(reset,filters=[s]).model_copy(update={'analysis_depth':'deep'})
            changed=p.workspace_revision(request)
            changed=p.workspace_revision(self.request_for(changed,filters=changed['interaction_state']['filters'],refresh=True))
            latest=self.pipeline(executor=self.p.executor)
            latest.provider=Mock(side_effect=AssertionError('non-AI visual'))
            chart=next(c for c in changed['charts'] if c['chart_type'] in {'line','area'})
            visual=latest.refine(AiReportRefineRequest(session_id=changed['session_id'],current_report={'revision':changed['revision']},
                visual_changes=[dict(chart_id=chart['id'],chart_type='area' if chart['chart_type']=='line' else 'line')]))
            self.assertEqual(visual['quality_assessment']['status'],'verified')
            from routers import reports
            from common import SavedReportCreate
            principal=SimpleNamespace(bound_owner='owner-a',owner_key='account:fixture',access_fingerprint=None,permits=lambda *args:False)
            stored={}
            def insert(payload,identity):
                stored.update(id=identity,module_config=payload.module_config)
                return stored
            with patch.object(reports,'_principal',return_value=principal), \
                 patch.object(reports,'_insert_saved',side_effect=insert), \
                 patch('services.analysis_pipeline.AnalysisPipeline.catalog',return_value=self.catalog), \
                 patch('services.metadata_service.get_local_metadata',side_effect=f.physical_metadata), \
                 patch('services.access_policy.current_principal',return_value=SimpleNamespace()):
                reports.create_saved_report(SavedReportCreate(title='Fixture report',sql_query='',module_config=visual))
                from unittest.mock import MagicMock
                conn=MagicMock();conn.cursor.return_value.__enter__.return_value.fetchone.return_value=stored
                with patch.object(reports,'get_db_conn',return_value=MagicMock(__enter__=Mock(return_value=conn))):
                    reopened=reports.get_saved_report(stored['id'])['module_config']
            self.assertEqual(reopened['charts'],visual['charts'])
            self.assertEqual(reopened['interaction_state'],visual['interaction_state'])
            physical.assert_not_called();p.provider.assert_not_called();latest.provider.assert_not_called()

    def test_http_contract_forbids_sql_and_atomically_returns_server_revision(self):
        from fastapi import FastAPI
        from routers import ai
        from tests.http_fixture import ASGIClient
        r=self.initial()
        app=FastAPI();app.include_router(ai.router);client=ASGIClient(app)
        payload=self.request_for(r).model_dump()
        def execute(sql,**kwargs):
            from evals.fixture_warehouse import FixtureWarehouse
            from evals import fixture_warehouse as w
            with patch.dict(w.DATA,self.data):
                warehouse=FixtureWarehouse(self.catalog.overlay)
                try:return warehouse(sql,**kwargs)
                finally:warehouse.close()
        with patch.object(ai,'browser_owner',return_value='owner-a'),patch.object(ai,'AnalysisPipeline',return_value=self.pipeline(executor=execute)):
            denied=client.post('/api/ai/workspace-revision',json=dict(payload,sql='SELECT 1'))
            self.assertEqual(denied.status_code,422)
            response=client.post('/api/ai/workspace-revision',json=payload)
        self.assertEqual(response.status_code,200)
        result=response.json()
        self.assertEqual(result['revision'],r['revision']+1)
        self.assertEqual(result['interaction_contract']['revision'],result['revision'])

    def test_http_disconnect_sets_revision_cancellation_before_worker_can_publish(self):
        import asyncio
        from fastapi import Response
        from unittest.mock import AsyncMock
        from routers import ai
        from services.provider_budget import request_cancelled
        from threading import Event
        r=self.initial();observed=Event()
        def invoke(*args):
            event=request_cancelled.get()
            event.wait(2)
            if event.is_set():observed.set()
            return {'status':'stopped'}
        with patch.object(ai,'browser_owner',return_value='owner-a'),patch.object(ai,'_invoke',side_effect=invoke):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(ai.workspace_revision(self.request_for(r),SimpleNamespace(is_disconnected=AsyncMock(return_value=True)),Response()))
            self.assertEqual(error.exception.status_code,499)
        self.assertTrue(observed.wait(1))
        self.assertEqual(get_session(r['session_id']).revision,r['revision'])

    def test_repeated_non_ai_apply_does_not_exhaust_semantic_history_or_provider_budget(self):
        original=self.initial('revenue')
        report=original
        for _ in range(25):
            report=self.p.workspace_revision(self.request_for(report,refresh=True))
        self.assertEqual(report['revision'],original['revision']+25)
        self.assertEqual(report['quality_assessment']['status'],'verified')
        self.assertLessEqual(len(get_session(report['session_id']).semantic_history),20)
        self.assertEqual(original['revision'],1)
        self.assertEqual(original['provenance']['semantic_history'],[])
        self.p.provider.assert_not_called()

    def test_identity_filter_pins_label_axis_without_hiding_the_exact_answer(self):
        r=self.initial('revenue',['store'])
        selection=self.selection(r,'store_id');key=selection['values'][0]['value']
        changed=self.p.workspace_revision(self.request_for(r,filters=[selection]))
        self.assertFalse(any(c.get('x_field')=='store' for c in changed['charts']))
        self.assertFalse(any(len(c.get('data',[]))<2 for c in changed['charts']))
        expected=sum(o['tong_tien'] for o in self.data['don_hang'] if o['co_so_ma']==key
            and o['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'} and '2026-09-01'<=o['ngay_tao'][:10]<='2026-09-30')
        q=next(q for q in changed['analytical_queries'] if q['role']=='requested')
        self.assertEqual(changed['result_sets'][q['id']]['rows'][0]['revenue'],expected)
        self.assertEqual(changed['quality_assessment']['status'],'verified')

    def test_saved_render_policy_cannot_be_removed_or_downgraded(self):
        r=self.initial()
        self.assertTrue(r['quality_context']['ui_constraints']['fixed_grouping_policy'])
        self.assertEqual(verify_saved_report(r,self.catalog),r['quality_assessment'])
        for value in (None,'unknown-policy'):
            forged=deepcopy(r)
            forged['quality_context']['ui_constraints']['fixed_grouping_policy']=value
            self.assertEqual(verify_saved_report(forged,self.catalog)['status'],'not_scored')
