"""Sixth-generator observations must survive both public CSV exports."""
import csv,datetime,gzip,importlib.util,json,pathlib,subprocess,sys,tempfile,unittest
C=pathlib.Path(__file__).resolve().parent;ROOT=C.parents[4]
spec=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/aws-k6/test_aws_analysis.py');fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
class SixGeneratorExports(unittest.TestCase):
 def test_both_exports_include_sixth_generator_and_all_requests(self):
  with tempfile.TemporaryDirectory() as temp:
   p=pathlib.Path(temp);fixture.fixture(p)
   (p/'target.jsonl.gz').write_bytes(gzip.compress((p/'target.jsonl').read_bytes()))
   metadata=json.loads((p/'metadata.json').read_text());metadata['vus']=1000;metadata['generator_count']=6;(p/'metadata.json').write_text(json.dumps(metadata))
   t=(datetime.datetime.fromisoformat(metadata['load_started_at'])+datetime.timedelta(seconds=65)).isoformat()
   for i,vu in enumerate((167,167,167,167,166,166),1):
    g=p/('generator'+str(i));g.mkdir();fixture.fixture(g)
    with gzip.open(g/'stage-vus.jsonl.gz','rt') as f:rows=[json.loads(l) for l in f]
    with gzip.open(g/'stage-vus.jsonl.gz','wt') as f:
     for r in rows:r['value']=vu;f.write(json.dumps(r)+'\n')
    window={'observed_at':t,'phase':'hold','route':'/users/branches/public','requests':i,'failures':0,'checks_passed':i,'checks':i,'p95_ms':i*10,'latency_samples':i,'latency_sum_ms':i*10}
    with gzip.open(g/'http-windows.jsonl.gz','wt') as f:f.write(json.dumps(window)+'\n')
   for name in ('correlate.py','network-correlate.py'):
    r=subprocess.run([sys.executable,'-B',str(C/name),str(p)],cwd=ROOT,capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)
   with (p/'correlation.csv').open() as f:rows=list(csv.DictReader(f))
   self.assertEqual({r['generator'] for r in rows},{'generator'+str(i) for i in range(1,7)})
   self.assertEqual(sum(int(r['requests_5s']) for r in rows),21)
   self.assertEqual(sum(float(r['actual_vus_sample']) for r in rows),1000)
   with (p/'network-correlation.csv').open() as f:network=list(csv.DictReader(f))
   self.assertEqual(sum(int(r['requests']) for r in network),21)
   self.assertEqual(float(network[0]['route_shard_p95_max_ms']),60)
if __name__=='__main__':unittest.main()
