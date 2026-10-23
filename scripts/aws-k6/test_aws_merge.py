import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('merge', Path(__file__).with_name('merge-aws-generators.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def shard(folder, latencies, second=0):
    folder.mkdir()
    (folder / 'metadata.json').write_text(json.dumps({'vus':125, 'hold_seconds':120, 'load_started_at':f'2026-10-14T00:00:0{second}+00:00', 'load_finished_at':'2026-10-14T00:03:30+00:00'}))
    (folder / 'k6.json').write_text(json.dumps({'metrics':{'http_reqs':{'values':{'count':len(latencies)}},'checks':{'values':{'passes':len(latencies)*3,'fails':0}}}}))
    rows=[]
    for value in latencies:
        for metric, sample in [('http_reqs',1),('http_req_failed',0),('http_req_duration',value),('response_statuses',1),*([('checks',1)]*3)]:
            rows.append({'type':'Point','metric':metric,'data':{'value':sample,'tags':{'phase':'hold','status':'200'}}})
    with gzip.open(folder / 'http-points.jsonl.gz','wt') as f:
        f.write(''.join(json.dumps(r)+'\n' for r in rows))


class MergeTests(unittest.TestCase):
    def test_time_windows_keep_exact_observations_and_route_scope(self):
        spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('archive-aws-points.py'));archive=importlib.util.module_from_spec(spec);spec.loader.exec_module(archive)
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);raw=d/'raw.gz';out=d/'windows.gz';rows=[]
            for metric,value in [('http_reqs',1),('http_req_failed',0),('checks',1),('http_req_duration',10),('http_req_duration',100)]:rows.append({'type':'Point','metric':metric,'data':{'time':'2026-10-14T00:01:02Z','value':value,'tags':{'phase':'hold','name':'public_branches'}}})
            rows.append({'type':'Point','metric':'http_req_duration','data':{'time':'2026-10-14T00:01:02Z','value':999,'tags':{'phase':'hold','name':'private-route'}}})
            with gzip.open(raw,'wt') as stream:stream.write(''.join(json.dumps(row)+'\n' for row in rows))
            self.assertEqual(archive.time_windows(raw,out),1)
            with gzip.open(out,'rt') as stream:row=json.loads(next(stream))
            self.assertEqual(row['observed_at'],'2026-10-14T00:01:00+00:00');self.assertEqual(row['p95_ms'],95.5)
            self.assertEqual(row['latency_sum_ms'],110);self.assertEqual(row['requests'],1)
    def test_archive_preserves_actual_vus_and_timestamps(self):
        spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('archive-aws-points.py'));archive=importlib.util.module_from_spec(spec);spec.loader.exec_module(archive)
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);folder=d/'shard';shard(folder,[10,20])
            with gzip.open(folder/'http-points.jsonl.gz','at') as stream:stream.write(json.dumps({'type':'Point','metric':'vus','data':{'time':'2026-10-14T00:01:01Z','value':125}})+'\n')
            result=archive.archive(folder,d/'raw')
            self.assertEqual(result['actual_vu_peak'],125)
            with gzip.open(folder/'stage-vus.jsonl.gz','rt') as stream:row=json.loads(next(stream))
            self.assertEqual(row,{'observed_at':'2026-10-14T00:01:01Z','metric':'vus','value':125})
    def test_quantiles_use_points_not_average_shard_percentiles(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a';b=d/'b';shard(a,[10]*99+[1000]);shard(b,[2000],1)
            summary,meta=m.merge([a,b])
            self.assertEqual(summary['metrics']['http_req_duration']['values']['p(95)'],10)
            self.assertEqual(summary['metrics']['http_req_duration']['values']['p(90)'],10)
            self.assertEqual(summary['metrics']['http_reqs']['values']['count'],101)
            self.assertEqual(summary['metrics']['checks']['values']['rate'],1)
            self.assertEqual(meta['vus'],250)
            self.assertEqual(meta['start_skew_seconds'],1)

    def test_missing_output_and_clock_skew_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a';b=d/'b';shard(a,[10]);shard(b,[20],3)
            with self.assertRaisesRegex(ValueError,'unsynchronized'):m.merge([a,b])
            meta=json.loads((b/'metadata.json').read_text());meta['load_started_at']='2026-10-14T00:00:01+00:00';(b/'metadata.json').write_text(json.dumps(meta))
            with gzip.open(b/'http-points.jsonl.gz','wt') as f:f.write('')
            with self.assertRaisesRegex(ValueError,'incomplete'):m.merge([a,b])

    def test_compact_observations_preserve_exact_results(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a';b=d/'b';shard(a,[10,20]);shard(b,[30,40])
            expected,_=m.merge([a,b])
            for folder in [a,b]:
                raw=folder/'http-points.jsonl.gz'
                with gzip.open(raw,'rt') as f:rows=[json.loads(line) for line in f]
                with gzip.open(folder/'metric-points.jsonl.gz','wt') as f:
                    for row in rows:
                        tags=row['data']['tags'];f.write(json.dumps([row['metric'],row['data']['value'],tags.get('phase'),tags.get('status'),tags.get('name')])+'\n')
                raw.unlink()
            actual,_=m.merge([a,b]);self.assertEqual(actual,expected)

    def test_failure_rates_use_all_actual_checks_and_requests(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a';b=d/'b';shard(a,[10]*10);shard(b,[10]*10)
            with gzip.open(b/'http-points.jsonl.gz','rt') as f:rows=[json.loads(line) for line in f]
            changed=0
            for row in rows:
                if row['metric']=='http_req_failed' and changed<5:
                    row['data']['value']=1;changed+=1
            with gzip.open(b/'http-points.jsonl.gz','wt') as f:f.write(''.join(json.dumps(row)+'\n' for row in rows))
            summary,_=m.merge([a,b])
            metric=summary['metrics']['http_req_failed{phase:hold}']
            self.assertEqual(metric['values']['rate'],.25)
            self.assertFalse(metric['thresholds']['rate<0.02']['ok'])

    def test_hold_latency_and_failure_thresholds_enforced(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d);a=d/'a';b=d/'b';shard(a,[2000]*10);shard(b,[2000]*10)
            summary,_=m.merge([a,b])
            self.assertFalse(summary['metrics']['http_req_duration{phase:hold}']['thresholds']['p(95)<1500']['ok'])

if __name__ == '__main__':unittest.main()
