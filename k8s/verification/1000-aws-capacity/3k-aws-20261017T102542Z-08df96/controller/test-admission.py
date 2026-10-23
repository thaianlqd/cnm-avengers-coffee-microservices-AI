"""Offline admission and progression checks; no AWS resources or load."""
import ast,datetime,importlib.util,json,pathlib,subprocess,tempfile,unittest
from unittest.mock import patch
E=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('launch1000',E/'controller/launch-1000.py');launch=importlib.util.module_from_spec(spec);spec.loader.exec_module(launch)
class Admission(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.e=pathlib.Path(self.temp.name)
  for name in ('authorization.json','projected-cost.json','read-only-preflight.json','source-manifest.json'):(self.e/name).write_bytes((E/name).read_bytes())
  self.scope=patch.object(launch,'e',self.e);self.scope.start();self.addCleanup(self.scope.stop)
  self.inventory=patch.object(launch.session.a,'require_clean_benchmark_inventory');self.inventory_mock=self.inventory.start();self.addCleanup(self.inventory.stop)
  self.aws=patch.object(launch.session.a,'aws',side_effect=AssertionError('offline test must never call AWS'));self.aws.start();self.addCleanup(self.aws.stop)
  self.popen=patch.object(launch.subprocess,'Popen',side_effect=AssertionError('offline test must never start controls'));self.popen.start();self.addCleanup(self.popen.stop)
  # check_output also uses Popen: branch identity is a fixed offline fixture here.
  self.branch=patch.object(launch.subprocess,'check_output',return_value='features_k8s\n');self.branch.start();self.addCleanup(self.branch.stop)
  self.edit('authorization.json',user_approved=False,approved_additional_credit_usd=0)
 def edit(self,name,**values):
  p=self.e/name;data=json.loads(p.read_text());data.update(values);p.write_text(json.dumps(data))
 def approve_fixture(self):
  self.edit('authorization.json',user_approved=True,approved_additional_credit_usd=3.0)
  self.edit('read-only-preflight.json',observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),account_plan='FREE',account_plan_directly_verified=True)
 def test_pending_credit_blocks_before_inventory(self):
  with self.assertRaisesRegex(ValueError,'explicit user approval'):launch.validate()
  self.inventory_mock.assert_not_called()
 def test_closed750_scope_cannot_authorize1000(self):
  self.approve_fixture();self.edit('authorization.json',approved_additional_credit_usd=2.2,maximum_generators=5,maximum_workload_vus=750,runtime_minutes=90,run_1000=False)
  with self.assertRaisesRegex(ValueError,'explicit user approval'):launch.validate()
  self.inventory_mock.assert_not_called()
 def test_free_plan_console_verification_required(self):
  self.approve_fixture();self.edit('read-only-preflight.json',account_plan_directly_verified=False)
  with self.assertRaises(AssertionError):launch.validate()
  self.inventory_mock.assert_not_called()
 def test_approved_scope_checks_all176_frozen_files(self):
  self.approve_fixture();manifest,archive=launch.validate()
  self.assertEqual(len(manifest['files']),176);self.assertTrue(archive.is_file());self.inventory_mock.assert_called_once()
 def test_stale_inventory_blocks_before_control(self):
  self.approve_fixture();self.edit('read-only-preflight.json',observed_at=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(minutes=11)).isoformat())
  with self.assertRaisesRegex(AssertionError,'refresh AWS'):launch.validate()
  self.inventory_mock.assert_not_called()
class Progression(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.e=pathlib.Path(self.temp.name)
  tree=ast.parse((E/'controller/qualify-1000.py').read_text());defs=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('save','valid','point')]
  self.ns={'e':self.e,'controller':E/'controller','json':json,'datetime':datetime,'subprocess':subprocess,'sys':__import__('sys'),'root':launch.root,'results':[]}
  exec(compile(ast.Module(body=defs,type_ignores=[]),'<isolated progression functions>','exec'),self.ns)
 def test_invalid_generator_blocks_higher_claim(self):
  p=self.e/'normal-1000';p.mkdir();a={'status':'INVALID GENERATOR','generator_adequate':False,'http_pass':True,'target_reasons':[],'post_smoke':True,'natural_recovery':True};(p/'analysis.json').write_text(json.dumps(a))
  with patch.object(subprocess,'run',return_value=subprocess.CompletedProcess([],0)):
   with self.assertRaisesRegex(RuntimeError,'did not qualify'):self.ns['point']('normal-1000',1000,120,6)
  result=json.loads((self.e/'progression.json').read_text());self.assertFalse(result['results'][0]['valid_pass']);self.assertFalse((self.e/'qualification.json').exists())
 def test_above1000_rejected_before_load(self):
  with patch.object(subprocess,'run') as run:
   with self.assertRaises(AssertionError):self.ns['point']('forbidden',1001,120,6)
   run.assert_not_called()
if __name__=='__main__':unittest.main()
