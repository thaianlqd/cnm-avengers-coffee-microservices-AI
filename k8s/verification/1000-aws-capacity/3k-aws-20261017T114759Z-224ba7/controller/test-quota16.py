"""Offline tests for a separately approved two-target experiment within16vCPU."""
import ast,datetime,importlib.util,json,pathlib,subprocess,tempfile,unittest
from unittest.mock import MagicMock,patch
C=pathlib.Path(__file__).resolve().parent;E=C.parent;ROOT=C.parents[4]
def load(name,file):
 s=importlib.util.spec_from_file_location(name,file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
m=load('private2',C/'private-session-2target.py');launch=load('launch2',C/'launch-1000.py');observer=load('observer2',C/'point-observe.py')
class Guard(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.e=pathlib.Path(self.temp.name)
  for n in ('authorization.json','projected-cost.json','source-manifest.json','read-only-preflight.json'):(self.e/n).write_bytes((E/n).read_bytes())
  self.plan=json.loads((self.e/'projected-cost.json').read_text())
 def edit(self,n,**kw):
  p=self.e/n;d=json.loads(p.read_text());d.update(kw);p.write_text(json.dumps(d))
 def approve(self):self.edit('authorization.json',user_approved=True,approved_additional_credit_usd=3.0)
 def test_pending_scope_cannot_reuse_original_three_target_approval(self):
  for targets in (2,3):
   self.edit('authorization.json',targets=targets,user_approved=targets==3,approved_additional_credit_usd=3.0 if targets==3 else 0)
   with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory') as inventory,patch.object(m,'launch_instance') as create:
    with self.assertRaisesRegex(ValueError,'approval'):m.start(self.e/'private','3k-aws-20261017T114759Z-abcdef',self.e,6,95)
    inventory.assert_not_called();create.assert_not_called();self.assertFalse((self.e/'private').exists())
 def test_aggregate_budget_includes_prior_closed_run(self):
  self.approve();m.validate_extended_topology(self.e,self.plan,6,95)
  self.assertLessEqual(sum(self.plan[k] for k in ('max_compute_usd','prior_closed_run_compute_upper_bound_usd','ebs_reserve_usd','ipv4_reserve_usd','transfer_contingency_usd')),3.0)
  for field,value in [('max_compute_usd',1),('transfer_contingency_usd',.6),('prior_closed_run_compute_upper_bound_usd',.1),('hard_max_instances',9)]:
   with self.subTest(field=field):
    bad=self.plan|{field:value}
    with self.assertRaises(ValueError):m.validate_extended_topology(self.e,bad,6,95)
 def test_prior_cost_and_cleanup_digests_are_pinned(self):
  self.approve()
  for field in ('prior_cost_summary_sha256','prior_cleanup_summary_sha256'):
   with self.subTest(field=field):
    with self.assertRaisesRegex(ValueError,'digest'):m.validate_extended_topology(self.e,self.plan|{field:'0'*64},6,95)
 def test_native_fleet_launches_only_two_targets_and_terminates_controls(self):
  self.approve();folder=self.e/'private';roles=[];processes=[]
  def cert(*args,**kwargs):(folder/'controller.key').write_text('synthetic key')
  def popen(command,**kw):
   if command[0]=='cloudflared':kw['stdout'].write('https://synthetic.trycloudflare.com\n');kw['stdout'].flush()
   p=MagicMock();p.pid=12000+len(processes);p.poll.return_value=0;processes.append(p);return p
  def create(_folder,role,*args):roles.append(role);return {'id':'i-'+role}
  def verify(_folder,role,*args):
   if role=='generator1':(folder/'FINISH').write_text('synthetic bounded completion')
  with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory',return_value={}),patch.object(m,'openssl',side_effect=cert),patch.object(m.subprocess,'Popen',side_effect=popen),patch.object(m.a,'aws',return_value={'GroupId':'sg-synthetic'}),patch.object(m,'launch_instance',side_effect=create),patch.object(m,'verify_recipient',side_effect=verify),patch.object(m.a,'cleanup',return_value={'pass':True}):
   m.start(folder,'3k-aws-20261017T114759Z-abcdef',self.e,6,95)
  self.assertEqual(roles,['target1','target2','generator1']);self.assertTrue((folder/'CLOSED').exists());self.assertFalse((folder/'controller.key').exists());self.assertFalse((folder/'token').exists())
  self.assertEqual(json.loads((folder/'state.json').read_text())['target_count'],2)
  for p in processes:p.terminate.assert_called_once()
 def test_sigterm_cleanup_removes_sixth_generator_private_jobs(self):
  self.approve();folder=self.e/'private'
  def cert(*args,**kwargs):
   (folder/'controller.key').write_text('synthetic key');r=folder/'generator6';r.mkdir()
   for ext in ('json','cms','stdout','stderr'):(r/('0123456789abcdef.'+ext)).write_text('synthetic private output')
   raise SystemExit(143)
  with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory',return_value={}),patch.object(m,'openssl',side_effect=cert),patch.object(m.a,'cleanup',return_value={'pass':True}):
   with self.assertRaises(SystemExit):m.start(folder,'3k-aws-20261017T114759Z-abcdef',self.e,6,95)
  self.assertTrue((folder/'CLOSED').exists());self.assertEqual(list((folder/'generator6').iterdir()),[])
 def test_failed_cleanup_never_marks_closed(self):
  self.approve();folder=self.e/'private'
  with patch.object(m.subprocess,'check_output',return_value='features_k8s\n'),patch.object(m.a,'require_clean_benchmark_inventory',return_value={}),patch.object(m,'openssl',side_effect=SystemExit(143)),patch.object(m.a,'cleanup',return_value={'pass':False}):
   with self.assertRaises(RuntimeError):m.start(folder,'3k-aws-20261017T114759Z-abcdef',self.e,6,95)
  self.assertFalse((folder/'CLOSED').exists());self.assertTrue((self.e/'cleanup-failure.json').exists())
 def test_launch_requires_fresh_direct_free_plan_verification(self):
  self.approve();self.edit('read-only-preflight.json',observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),account_plan='FREE',account_plan_directly_verified=False)
  with patch.object(launch,'e',self.e),patch.object(launch.subprocess,'check_output',return_value='features_k8s\n'),patch.object(launch.session.a,'require_clean_benchmark_inventory') as inventory:
   with self.assertRaises(AssertionError):launch.validate()
   inventory.assert_not_called()
class Observation(unittest.TestCase):
 def test_two_node_baseline_still_requires_all_pods_hpa_and_metrics(self):
  expected={'api-gateway':2,'identity-service':1,'menu-service':1,'news-service':1}
  def k(*args):
   if 'deployments' in args:return json.dumps({'items':[{'metadata':{'name':n},'spec':{'replicas':r},'status':{'availableReplicas':r,'updatedReplicas':r}} for n,r in expected.items()]})
   if 'hpa' in args:return json.dumps({'items':[{'metadata':{'name':n},'status':{'currentMetrics':[{'resource':{}}],'conditions':[{'type':'ScalingActive','status':'True'}]}} for n in expected if n!='news-service']})
   if 'nodes' in args:return '\n'.join(['node 50m 1% 100Mi 1%']*count)
   return '\n'.join(['pod 50m 100Mi']*5)
  for count,passed in ((2,True),(1,False),(3,False)):
   with self.subTest(count=count),patch.object(observer,'k',side_effect=k):self.assertEqual(observer.stable(),passed)
 def test_crypto_transport_and_addition_protocol_ast_unchanged(self):
  old=ast.parse((ROOT/'scripts/aws-k6/aws-private-session.py').read_text());new=ast.parse((C/'private-session-2target.py').read_text())
  for name in ('openssl','submit','console_matches_certificate','bootstrap','launch_instance','verify_recipient','add_generator','interrupted'):
   extract=lambda tree:ast.dump(next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name))
   self.assertEqual(extract(old),extract(new),name)
if __name__=='__main__':unittest.main()
