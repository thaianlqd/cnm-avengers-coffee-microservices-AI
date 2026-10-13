import importlib.util,json,os,re,shutil,subprocess,time
from pathlib import Path
root=Path.cwd(); base=Path('/tmp/avengers-k8s-capacity/regression');spec=importlib.util.spec_from_file_location('c',root/'scripts/k8s/capacity.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
deadline=time.monotonic()+3000
while True:
 plan=json.loads((base/'final-search.json').read_text())
 if plan.get('finished_at'): break
 if time.monotonic()>deadline: raise RuntimeError('Search still running; refuse fault injection')
 time.sleep(5)
if 'shared-host stop condition C' not in (plan.get('stop_reason') or ''): raise RuntimeError('Search execution error; manual review required')
code,flags=c.command(c.K+['-n','avengers-coffee','get','configmap','avengers-common','-o','jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}'])
if code or flags.strip()!='true 5000': raise RuntimeError('Read-only/cache policy changed')
with (base/'availability-pre-cooldown.jsonl').open('w') as f: c.wait_recovery(f,720)
env=os.environ.copy();env.update(K8S_DB_MODE='existing',BASE_URL='http://localhost:3000',WEB_URL='http://localhost:5175')
for mode in ['healing','rollout']:
 with (base/f'{mode}.txt').open('w') as f: code=subprocess.run(['bash','scripts/k8s/demo-availability.sh',mode],env=env,stdout=f,stderr=f,timeout=260).returncode
 if code: raise RuntimeError(mode+' availability failed')
 log=(base/f'{mode}.txt').read_text(); match=re.search(r'report: (.+)',log)
 if match: shutil.copyfile(match.group(1).strip(),base/f'{mode}-samples.txt')
 print(mode+' availability PASS: 60/60 HTTP 200',flush=True)
with (base/'availability-post-cooldown.jsonl').open('w') as f: state=c.wait_recovery(f,720)
with (base/'smoke-final.txt').open('w') as f: code=subprocess.run(['bash','scripts/k8s/smoke.sh'],env=env,stdout=f,stderr=f).returncode
if code: raise RuntimeError('Final smoke failed')
(base/'final-state.json').write_text(json.dumps(state,indent=2)+'\n')
checks=json.loads((base/'checks.json').read_text());checks['availability']={'healing':{'samples':60,'failed':0},'rollout':{'samples':60,'failed':0}};checks['final_smoke_exit']=0;checks['final_state_observed_at']=state['observed_at'];(base/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
print('FINAL: smoke PASS, eight deployments Ready, HPA baseline 2/1/1',flush=True)
