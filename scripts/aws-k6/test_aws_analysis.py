import datetime as dt,gzip,importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('analysis',Path(__file__).with_name('analyze-aws-capacity.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture(folder,fd=10,restart=0,metrics=True):
    start=dt.datetime(2026,10,14,tzinfo=dt.timezone.utc)
    (folder/'metadata.json').write_text(json.dumps({'vus':250,'hold_seconds':120,'fd_soft':'1024','load_started_at':start.isoformat()}))
    summary={k:{'values':{'rate':0,'count':1,'p(95)':10,'p(99)':20},'thresholds':{'test':{'ok':True}}} for k in ('http_req_failed','checks','http_req_duration','http_req_failed{phase:hold}','checks{phase:hold}','http_req_duration{phase:hold}','http_reqs{phase:hold}','http_reqs')} if metrics else {}
    (folder/'k6.json').write_text(json.dumps({'metrics':summary}));(folder/'k6.log').write_text('')
    rows=[];generators=[]
    for i in range(47):
        t=(start+dt.timedelta(seconds=i*5)).isoformat()
        rows.append({'observed_at':t,'pods':[{'uid':'pod','phase':'Running','containers':[{'restartCount':restart if i>12 else 0}]}],'hpa':[{'name':'api-gateway','status':{'currentReplicas':2,'desiredReplicas':2,'currentMetrics':[{'resource':{'name':'cpu'}}],'conditions':[{'type':'ScalingActive','status':'True'}]}}],'nodes':[{'conditions':[{'type':'Ready','status':'True'},{'type':'MemoryPressure','status':'False'}]}],'top_nodes':'node 30m 1% 100Mi 1%'})
        generators.append({'observed_at':t,'cpu_ticks':[0,0,0,100+i*100,0,0,0,0],'memory_KiB':{'MemAvailable':1024*1024},'processes':[{'pid':1,'name':'k6','user_ticks':i,'system_ticks':0,'rss_bytes':1000000,'fds':fd}],'network_bytes':{'eth0':{'rx':i*1000,'tx':i*1000}},'ena_valid':True,'ena':{'eth0':{'bw_in_allowance_exceeded':0,'bw_out_allowance_exceeded':0,'pps_allowance_exceeded':0,'conntrack_allowance_exceeded':0}}})
    for row in rows:
        row['top_pods']='gateway-pod 50m 128Mi'
        for name in ('identity-service','menu-service'):
            row['hpa'].append({'name':name,'status':{'currentReplicas':1,'desiredReplicas':1,'currentMetrics':[{'resource':{'name':'cpu'}}],'conditions':[{'type':'ScalingActive','status':'True'}]}})
    for name,data in [('target.jsonl',rows),('generator.jsonl',generators)]:(folder/name).write_text(''.join(json.dumps(r)+'\n' for r in data))
    with gzip.open(folder/'stage-vus.jsonl.gz','wt') as stream:
        for row in rows:stream.write(json.dumps({'observed_at':row['observed_at'],'metric':'vus','value':250})+'\n')
    for name in ('post-smoke.json','recovery.json'):(folder/name).write_text('{"passed":true}')
class Gates(unittest.TestCase):
    def test_requested_vus_need_actual_sustained_timeline(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d)
            with gzip.open(d/'stage-vus.jsonl.gz','rt') as stream:rows=[json.loads(line) for line in stream]
            for row in rows:row['value']=200
            with gzip.open(d/'stage-vus.jsonl.gz','wt') as stream:stream.write(''.join(json.dumps(row)+'\n' for row in rows))
            result=m.analyze(d);self.assertEqual(result['status'],'FAIL')
            self.assertIn('requested VUs not sustained during hold',result['target_reasons'])
            (d/'stage-vus.jsonl.gz').unlink()
            self.assertIn('actual VU timeline missing',m.analyze(d)['target_reasons'])
    def test_missing_hpa_or_pod_metrics_cannot_qualify(self):
        for missing in ('hpa','top_pods'):
            with self.subTest(missing=missing),tempfile.TemporaryDirectory() as d:
                d=Path(d);fixture(d)
                rows=[json.loads(line) for line in (d/'target.jsonl').read_text().splitlines()]
                for row in rows:row.pop(missing)
                (d/'target.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in rows))
                result=m.analyze(d)
                self.assertEqual(result['status'],'FAIL')
                self.assertIn('complete HPA/Pod/node metric evidence missing during hold',result['target_reasons'])

    def test_unknown_resource_metrics_are_missing_not_zero(self):
        row={'nodes':[{},{}],'top_nodes':'a 10m 1% 100Mi 1%\nb <unknown> <unknown> <unknown> <unknown>','top_pods':'pod <unknown> <unknown>'}
        result=m.resource_peaks([row])
        self.assertEqual(result['nodes']['a']['cpu_millicores'],10)
        self.assertNotIn('b',result['nodes']);self.assertEqual(result['incomplete_node_metric_samples'],1)
        self.assertFalse(m.complete_resource_metrics(row))
        self.assertIsNone(result['cluster_sampled_peak']['cpu_millicores'])
        self.assertEqual(result['complete_node_metric_samples'],0)
        missing_line=m.resource_peaks([{'nodes':[{},{}],'top_nodes':'a 10m 1% 100Mi 1%'}])
        self.assertIsNone(missing_line['cluster_sampled_peak']['cpu_millicores'])
    def test_unknown_node_metric_gap_prevents_qualification(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d)
            rows=[json.loads(line) for line in (d/'target.jsonl').read_text().splitlines()]
            for row in rows[20:30]:row['top_nodes']='node <unknown> <unknown> <unknown> <unknown>'
            (d/'target.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in rows))
            result=m.analyze(d);self.assertEqual(result['status'],'FAIL')
            self.assertFalse(result['complete_metric_hold_coverage']['sufficient'])
            self.assertIn('complete HPA/Pod/node metric evidence missing during hold',result['target_reasons'])

    def test_resource_peaks_keep_node_and_cluster_units_distinct(self):
        result=m.resource_peaks([{'top_nodes':'a 1500m 75% 1Gi 10%\nb 0.5 25% 512Mi 5%','top_pods':'gateway 75m 65536Ki'}])
        self.assertEqual(result['cluster_sampled_peak'],{'cpu_millicores':2000,'memory_MiB':1536})
        self.assertEqual(result['pods']['gateway']['memory_MiB'],64)
    def test_stable_gates_and_new_restart(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d);self.assertEqual(m.analyze(d)['status'],'STABLE PASS')
            fixture(d,restart=1);r=m.analyze(d);self.assertEqual(r['status'],'FAIL');self.assertEqual(r['restart_delta'],1)
    def test_archived_log_retains_socket_exhaustion_gate(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d)
            with gzip.open(d/'k6.log.gz','wt') as f:f.write('too many open files')
            (d/'k6.log').unlink()
            self.assertEqual(m.analyze(d)['status'],'INVALID GENERATOR')
            (d/'k6.log.gz').unlink()
            with self.assertRaisesRegex(ValueError,'missing k6 log'):m.analyze(d)
    def test_every_distributed_generator_must_be_adequate(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d)
            for name,fd in [('generator1',10),('generator2',900)]:
                (d/name).mkdir();fixture(d/name,fd=fd)
            meta=json.loads((d/'metadata.json').read_text());meta.update(vus=500,generator_count=2,start_skew_seconds=0);(d/'metadata.json').write_text(json.dumps(meta))
            result=m.analyze(d)
            self.assertEqual(result['status'],'INVALID GENERATOR')
            self.assertTrue(any('generator2' in reason for reason in result['generator_reasons']))
            (d/'generator2').rename(d/'missing')
            with self.assertRaisesRegex(ValueError,'missing generator'):m.analyze(d)
    def test_diagnostic_run_cannot_qualify(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d)
            meta=json.loads((d/'metadata.json').read_text());meta['diagnostic']=True;(d/'metadata.json').write_text(json.dumps(meta))
            result=m.analyze(d)
            self.assertFalse(result['qualification_eligible'])
            self.assertEqual(result['status'],'DIAGNOSTIC (NOT QUALIFICATION)')
    def test_actual_fd_limit_not_assumed_65536(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d,fd=900);self.assertEqual(m.analyze(d)['status'],'INVALID GENERATOR')
    def test_no_vacuous_http_pass(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d,metrics=False);self.assertFalse(m.analyze(d)['http_pass'])
    def test_missing_recovery_cannot_qualify(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d);(d/'recovery.json').unlink();self.assertEqual(m.analyze(d)['status'],'FAIL')
if __name__=='__main__':unittest.main()
