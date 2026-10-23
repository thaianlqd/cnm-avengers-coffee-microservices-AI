import importlib.util,json,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('logs',Path(__file__).with_name('aws-diagnostic-logs.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Logs(unittest.TestCase):
    def record(self):return {'kind':'capacity_diagnostics','at':'2026-10-16T10:00:00Z','interval_ms':30000,'bounds_ms':[1,5,'Inf'],'metrics':{'branches:dns_lookup':{'count':2,'sum':10,'max':8,'buckets':[0,1,1]}},'event_loop_ms':{'max':15}}
    def test_only_numeric_diagnostics_survive(self):
        row=self.record();row['password']='SECRET';row['metrics']['private:token']={'count':1,'sum':1,'max':1,'buckets':[1]};row['metrics']['branches:dns_lookup']['parameters']='SECRET';safe=m.sanitize('2026-10-16T10:00:01Z '+json.dumps(row));self.assertEqual(safe['metrics']['branches:dns_lookup']['count'],2);self.assertNotIn('SECRET',json.dumps(safe));self.assertNotIn('private',json.dumps(safe))
    def test_non_diagnostic_and_malformed_logs_are_discarded(self):
        for line in ['password=SECRET','{"kind":"other","token":"SECRET"}','not-json']:self.assertIsNone(m.sanitize(line))
        row=self.record();row['interval_ms']=float('nan');self.assertIsNone(m.sanitize(json.dumps(row)))
    def test_metrics_server_failures_are_bucketed_without_raw_urls(self):
        text='2026-10-16T10:00:02Z scrape failed: Get https://172.31.1.2:10250/metrics/resource?token=SECRET: context deadline exceeded\n'
        result=m.classify_metrics_logs(text,{'172.31.1.2':'target2'});self.assertEqual(result[0]['node'],'target2');self.assertEqual(result[0]['category'],'timeout');self.assertNotIn('SECRET',json.dumps(result));self.assertNotIn('172.31',json.dumps(result))
if __name__=='__main__':unittest.main()
