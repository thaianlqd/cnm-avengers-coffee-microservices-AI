"""One approved Free-plan fleet: setup only; capacity progression is gated separately."""
import concurrent.futures,datetime,hashlib,importlib.util,json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parents[5];active=root/'.cache/aws-capacity-private/active-750.json';meta=json.loads(active.read_text());folder=pathlib.Path(meta['folder']);e=pathlib.Path(meta['evidence']);controller=e/'controller'
assert e==pathlib.Path(__file__).resolve().parent.parent
for _ in range(180):
 if (folder/'CLOSED').exists() or (folder/'FINISH').exists():raise RuntimeError('session closed before setup')
 if (folder/'READY').exists():break
 time.sleep(3)
else:raise RuntimeError('authenticated control not ready')
spec=importlib.util.spec_from_file_location('session',root/'scripts/aws-k6/aws-private-session.py');session=importlib.util.module_from_spec(spec);spec.loader.exec_module(session)
proof=root/'k8s/verification/1k-aws-capacity/3k-aws-20261017T052200Z-952f9c/retained-normal-750/analysis.json'
for _ in range(2):session.add_generator(folder,e,proof)
def run(name,*args):
 print('BEGIN '+name,flush=True)
 subprocess.run([sys.executable,'-B',str(controller/(name+'.py')),*args],cwd=root,check=True)
 print('DONE '+name,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 fs=[pool.submit(run,n) for n in ('provision','generators')]
 for f in fs:f.result()
checks={'source_tree_sha256':meta['source_tree_sha256'],'git_base':meta['starting_head'],'tests':{}}
for service,count in [('api-gateway',29),('identity-service',60),('menu-service',45),('news-service',34)]:
 path=e/'build'/(service+'-tests.log');text=path.read_text();assert ('Tests:' in text and f'{count} passed' in text),service
 checks['tests'][service]={'passed':True,'pass':count,'log_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
checks['tests_passed']=168;checks['images']=[{k:o[k] for k in ('Id','RepoTags','Architecture','Os')} for o in [json.loads(line) for line in (e/'build/images.jsonl').read_text().splitlines()]]
assert len(checks['images'])==5 and all(o['Architecture']=='amd64' for o in checks['images'])
checks['image_tar_sha256']=(e/'build/images.sha256').read_text().split()[0];checks['workload_sha256']=hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest();(e/'build-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
run('deploy');run('configure','retained','--diagnostics','false','--keepalive','true');run('runtime');run('provenance');run('image-proof');run('conntrack','before-candidate','--install');run('precheck')
(e/'setup-ready.json').write_text(json.dumps({'passed':True,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'keepalive_candidate':True,'diagnostics':False,'source_tree_sha256':meta['source_tree_sha256']},indent=2)+'\n')
print('SETUP READY; no qualification claimed yet',flush=True)
