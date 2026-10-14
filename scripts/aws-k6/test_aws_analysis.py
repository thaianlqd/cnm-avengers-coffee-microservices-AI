import datetime as dt,importlib.util,json,tempfile,unittest
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
    for name,data in [('target.jsonl',rows),('generator.jsonl',generators)]:(folder/name).write_text(''.join(json.dumps(r)+'\n' for r in data))
    for name in ('post-smoke.json','recovery.json'):(folder/name).write_text('{"passed":true}')
class Gates(unittest.TestCase):
    def test_stable_gates_and_new_restart(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);fixture(d);self.assertEqual(m.analyze(d)['status'],'STABLE PASS')
            fixture(d,restart=1);r=m.analyze(d);self.assertEqual(r['status'],'FAIL');self.assertEqual(r['restart_delta'],1)
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
