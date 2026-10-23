"""Dry-run the fresh two-target gates without AWS or persisted capacity claims."""
import json,pathlib,runpy,subprocess,sys,tempfile,types,unittest
from unittest.mock import patch
C=pathlib.Path(__file__).resolve().parent;ROOT=C.parents[4]
HIST=ROOT/'k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e'
class FreshProgression(unittest.TestCase):
 def simulate(self,fail=False):
  with tempfile.TemporaryDirectory() as td:
   e=pathlib.Path(td);folder=e/'private';folder.mkdir();(folder/'READY').touch()
   meta={'source_tree_sha256':'ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75','run':e.name}
   (e/'authorization.json').write_text(json.dumps({'user_approved':True,'maximum_workload_vus':1000,'run_1000':True}));(e/'setup-ready.json').write_text('{}')
   roles={r:{'private_ip':'172.31.0.2'} for r in ('target1','target2','generator1','generator2','generator3')};state={'roles':roles,'max_generators':6,'runtime_minutes':95}
   for i in (1,2,3):(e/f'generator{i}-network-baseline.json').write_bytes((HIST/f'generator{i}-network-baseline.json').read_bytes())
   (e/'topology-provenance.json').write_text('{}')
   client=types.ModuleType('client');client.root=ROOT;client.run_path=e;client.folder=folder;client.meta=meta;client.state=lambda:state;client.submit=lambda *a,**kw:b'{"passed":true}'
   def add(*args):roles['generator'+str(sum(r.startswith('generator') for r in roles)+1)]={'private_ip':'172.31.0.2'}
   client.session=types.SimpleNamespace(add_generator=add);calls=[]
   def fake_run(args,**kw):
    name=pathlib.Path(args[2]).name
    if name=='point.py':
     point=args[3];vus=int(args[4]);hold=int(args[args.index('--hold')+1]);calls.append((point,vus,hold));p=e/point;p.mkdir()
     bad=fail and point=='normal-1000';a={'status':'INVALID GENERATOR' if bad else 'STABLE PASS','generator_adequate':not bad,'http_pass':True,'target_reasons':[],'post_smoke':True,'natural_recovery':True};(p/'analysis.json').write_text(json.dumps(a))
    if name=='healing.py':(e/('retained-'+args[3]+'.json')).write_text('{"passed":true}')
    return subprocess.CompletedProcess(args,0)
   with patch.dict(sys.modules,{'client':client}),patch.object(subprocess,'run',side_effect=fake_run):
    if fail:
     with self.assertRaisesRegex(RuntimeError,'did not qualify'):runpy.run_path(str(C/'qualify-1000.py'))
    else:runpy.run_path(str(C/'qualify-1000.py'))
   self.assertTrue((folder/'FINISH').exists())
   q=json.loads((e/'qualification.json').read_text()) if (e/'qualification.json').exists() else None
   return calls,q
 def test_matching_dataset_still_needs_fresh750normal_and_long_on_two_targets(self):
  calls,q=self.simulate();self.assertEqual([(v,h) for _,v,h in calls],[(500,120),(750,120),(750,300),(1000,120),(1000,300)]);self.assertEqual(q['target_nodes'],2)
 def test_invalid1000normal_cannot_advance_to_long_or_claim_qualified(self):
  calls,q=self.simulate(True);self.assertEqual(calls[-1][0],'normal-1000');self.assertIsNone(q);self.assertNotIn('long-1000',[n for n,_,_ in calls])
if __name__=='__main__':unittest.main()
