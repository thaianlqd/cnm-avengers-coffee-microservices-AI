"""Paid acceptance accounting and frozen denominators, with all HTTP mocked."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import tempfile
from unittest import TestCase
from unittest.mock import Mock,patch

from evals import live_acceptance_v33 as live

CASES=Path(live.__file__).with_name('live_cases_v34.json')


class LiveHarnessV34Tests(TestCase):
    def test_evidence_parent_is_writable_before_sending_and_prior_artifacts_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'new'/'run'/'result.json'
            live.prepare_v34_output(out)
            self.assertTrue(out.parent.is_dir());self.assertFalse(out.exists())
            out.with_suffix('.cases.json').write_text('[{"failed":"preserve"}]')
            with self.assertRaises(ValueError):live.prepare_v34_output(out)
            self.assertEqual(out.with_suffix('.cases.json').read_text(),'[{"failed":"preserve"}]')

    def test_unwritable_evidence_prevents_a_paid_run_before_meter_or_provider(self):
        with tempfile.TemporaryDirectory() as d:
            parent=Path(d)/'not-a-directory';parent.write_text('fixture')
            with patch.dict('os.environ',{'AI_OFFLINE':'0'}),patch('requests.post') as http,patch.object(live,'HttpMeter') as meter:
                with self.assertRaises(OSError):
                    live.run(240,True,parent/'out.json',approved_ceiling=240,job_mode=True,cases_file=CASES)
            meter.assert_not_called();http.assert_not_called()

    def ledger(self,directory):
        path=Path(directory)/'persistent.json'
        path.write_text(json.dumps({'reserved':151,'events':[{'case':'preserved_history'} for _ in range(151)]}))
        return path

    def test_cohort_preserves_old29_and_requires44_40_with_four_clarifications(self):
        spec=json.loads(CASES.read_text());live.validate_v34_cohort(spec,CASES)
        self.assertEqual(len(spec['semantic']),44)
        self.assertEqual(sum(c['expect'].startswith('useful') for c in spec['semantic']),40)
        for mutate in (lambda s:s['semantic'].pop(),lambda s:s['semantic'][0].update(expect='clarify'),
                       lambda s:s['semantic'][29].update(q='a replacement easy question')):
            altered=deepcopy(spec);mutate(altered)
            with tempfile.TemporaryDirectory() as d:
                file=Path(d)/'mutated.json';file.write_text(json.dumps(altered))
                with self.assertRaises(ValueError):live.validate_v34_cohort(altered,file)

    def test_full_run_refuses_small_remaining_budget_before_any_http(self):
        with tempfile.TemporaryDirectory() as d:
            ledger=self.ledger(d);out=Path(d)/'out.json'
            with patch.dict('os.environ',{'AI_OFFLINE':'0'}),patch('requests.post') as http:
                result=live.run(160,True,out,ledger,approved_ceiling=160,job_mode=True,cases_file=CASES)
            self.assertEqual(result['status'],'NOT_RUN');self.assertFalse(result['release_passed'])
            self.assertEqual(json.loads(ledger.read_text())['reserved'],151);http.assert_not_called()

    def test_missing_corrupt_or_disappeared_history_never_starts_from_zero(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'missing.json';http=Mock()
            with self.assertRaises(live.MeterExceeded):live.HttpMeter(240,http,path,require_existing=True)
            for value in ({'reserved':0,'events':[]},{'reserved':151,'events':[]},{'reserved':True,'events':[]}):
                path.write_text(json.dumps(value))
                with self.assertRaises(live.MeterExceeded):live.HttpMeter(240,http,path,require_existing=True)
            path=self.ledger(d);meter=live.HttpMeter(240,http,path,require_existing=True);path.unlink()
            with self.assertRaises(live.MeterExceeded):meter('https://generativelanguage.googleapis.com/fixture')
            http.assert_not_called()

    def test_timeout_consumes_reservation_and_restart_keeps_counter_and_private_mode(self):
        with tempfile.TemporaryDirectory() as d:
            path=self.ledger(d);http=Mock(side_effect=TimeoutError('fixture only'))
            meter=live.HttpMeter(240,http,path,require_existing=True);meter.case='L03'
            with self.assertRaises(TimeoutError):meter('https://generativelanguage.googleapis.com/fixture')
            state=json.loads(path.read_text());self.assertEqual(state['reserved'],152);self.assertEqual(len(state['events']),152)
            self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertEqual(live.HttpMeter(240,Mock(),path,require_existing=True).prior,152)
            self.assertFalse(http.call_args.kwargs['allow_redirects'])

    def test_parallel_meter_instances_cannot_exceed_shared_global_ceiling(self):
        with tempfile.TemporaryDirectory() as d:
            path=self.ledger(d);http=Mock(return_value='ok')
            meters=[live.HttpMeter(160,http,path,require_existing=True) for _ in range(4)]
            def send(i):
                try:return meters[i%4]('https://generativelanguage.googleapis.com/fixture')
                except live.MeterExceeded:return 'denied'
            with ThreadPoolExecutor(max_workers=4) as workers:results=list(workers.map(send,range(20)))
            self.assertEqual(results.count('ok'),9);self.assertEqual(http.call_count,9)
            self.assertEqual(json.loads(path.read_text())['reserved'],160)

    def test_changed_destination_is_denied_without_reservation_or_egress(self):
        with tempfile.TemporaryDirectory() as d:
            path=self.ledger(d);http=Mock();meter=live.HttpMeter(240,http,path,require_existing=True)
            for url in ['https://other.invalid/','http://generativelanguage.googleapis.com/',
                        'https://generativelanguage.googleapis.com.attacker.invalid/',
                        'https://generativelanguage.googleapis.com:444/']:
                with self.subTest(url=url),self.assertRaises(live.MeterExceeded):meter(url)
            self.assertEqual(json.loads(path.read_text())['reserved'],151);http.assert_not_called()

    def gate_fixture(self):
        cases=json.loads(CASES.read_text())['semantic']
        rows=[{'id':c['id'],'passed':True,'expected':c['expect'],'physical_http':1,'outcome':{'status':'success'}} for c in cases]
        rows[2]['outcome']['applied_filters']=[[{'dimension':'city','operator':'in','value':['Hồ Chí Minh','Hà Nội']}]]
        return {'release_passed':True,'cases':rows,'skipped':[],'useful_first_click':{'passed':40,'total':40}}

    def test_l03_and_no_wrong_success_remain_hard_gates_even_above95percent(self):
        self.assertTrue(live.apply_v34_release_gate(self.gate_fixture())['release_passed'])
        for change in ('l03','wrong_scope','missing_case','hidden_skip','clarify_http','wrong_total','numeric_failure'):
            result=self.gate_fixture()
            if change=='l03':result['cases'][2]['passed']=False;result['useful_first_click']['passed']=39
            if change=='wrong_scope':result['cases'][2]['outcome']['applied_filters'][0][0]['value'].append('Đà Nẵng')
            if change=='missing_case':result['cases'].pop()
            if change=='hidden_skip':result['skipped']=['L44']
            if change=='clarify_http':result['cases'][14]['physical_http']=4
            if change=='wrong_total':result['useful_first_click']['total']=39
            if change=='numeric_failure':result['cases'][30]['outcome']={'status':'error','error_category':'result_contract'}
            with self.subTest(change=change):self.assertFalse(live.apply_v34_release_gate(result)['release_passed'])

    def test_fifteen_new_questions_are_not_known_terminal_before_provider(self):
        from services.analysis_catalog import AnalysisCatalog
        from services.preflight_service import run
        from tests.analysis_fixtures import physical_metadata
        catalog=AnalysisCatalog(physical_metadata())
        for case in json.loads(CASES.read_text())['semantic'][29:]:
            with self.subTest(case=case['id']):
                pf=run(case['q'],catalog=catalog,reference=date(2026,10,18),coverage={})
                self.assertEqual(pf['capability']['decision'],'READY',[(f['code'],f.get('message')) for f in pf.get('findings',[])])
