#!/usr/bin/env python3
"""Outbound-only EC2 helper. Fixed public GET workload, no arbitrary commands."""
import datetime as dt, gzip, hashlib, json, os, pathlib, resource, subprocess
import sys, time, urllib.request, re
ROOT=pathlib.Path(__file__).resolve().parent
URL=(ROOT/'control-url').read_text().strip()
TOKEN=(ROOT/'control-token').read_text().strip()
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def request(path,data=None,timeout=30):
    r=urllib.request.Request(URL+path,data=data,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/octet-stream'})
    with urllib.request.urlopen(r,timeout=timeout) as out:return out.read()
def send(path,data):
    for attempt in range(12):
        try:return request(path,json.dumps(data).encode())
        except Exception:time.sleep(5)
    raise RuntimeError('control delivery unavailable')
def upload(job,name):
    body=(ROOT/job/name).read_bytes()
    for attempt in range(12):
        try:request('/upload/'+job+'/'+name,body,120);return
        except Exception:time.sleep(5)
    raise RuntimeError('artifact upload unavailable')
resource.setrlimit(resource.RLIMIT_NOFILE,(65536,resource.getrlimit(resource.RLIMIT_NOFILE)[1]))
boot={'observed_at':now(),'phase':'ready','k6_version':subprocess.check_output([str(ROOT/'k6'),'version'],text=True).strip(),
      'k6_sha256':hashlib.sha256((ROOT/'k6').read_bytes()).hexdigest(),'architecture':os.uname().machine,
      'cpu_count':os.cpu_count(),'memory_KiB':int(pathlib.Path('/proc/meminfo').read_text().splitlines()[0].split()[1]),
      'fd_soft':resource.getrlimit(resource.RLIMIT_NOFILE)[0],'fd_hard':resource.getrlimit(resource.RLIMIT_NOFILE)[1]}
send('/boot',boot)
seen=set();deadline=time.monotonic()+225*60
while time.monotonic()<deadline:
    try:task=json.loads(request('/job'))
    except Exception:time.sleep(3);continue
    job=task.get('job_id')
    if not job or job in seen:time.sleep(3);continue
    if task.get('action')=='stop':break
    if not re.fullmatch('[A-Za-z0-9_-]{1,96}',job) or task.get('action') not in ['network','run'] or not re.fullmatch('https://[a-z0-9-]+\\.trycloudflare\\.com',task.get('target_url','')):
        time.sleep(3);continue
    seen.add(job);folder=ROOT/job;folder.mkdir()
    send('/status/'+job,{'job_id':job,'phase':'started','observed_at':now()})
    try:
        if task['action']=='network':
            rows=[]
            for route in ['/menu/danh-muc','/menu/san-pham','/users/branches/public','/news?limit=100']:
                for repeat in range(3):
                    out=subprocess.check_output(['curl','--compressed','--fail','--silent','--max-time','15','-o','/dev/null','-w',
                        '%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{size_download} %{speed_download}',task['target_url']+route],text=True).split()
                    rows.append({'route':route,'repeat':repeat,'http_code':int(out[0]),**dict(zip(['dns_s','connect_s','tls_s','ttfb_s','total_s','wire_bytes','bytes_per_s'],map(float,out[1:])))})
            (folder/'network.json').write_text(json.dumps({'observed_at':now(),'samples':rows},indent=2));upload(job,'network.json');code=0
        else:
            vus=int(task['vus']);hold=int(task['hold'])
            if not 1<=vus<=5000 or not 120<=hold<=600:raise ValueError('invalid workload')
            (folder/'fd-limit.txt').write_text('65536\n')
            with (folder/'generator.jsonl').open('w') as metrics,(folder/'k6.log').open('w') as log:
                observer=subprocess.Popen([sys.executable,str(ROOT/'remote-metrics.py')],stdout=metrics)
                try:
                    env={**os.environ,'BASE_URL':task['target_url'],'THINK_SECONDS':'3','CAPACITY_VUS':str(vus),'CAPACITY_HOLD_SECONDS':str(hold),'SUMMARY_FILE':str(folder/'k6.json')}
                    p=subprocess.run([str(ROOT/'k6'),'run','--new-machine-readable-summary=false',str(ROOT/'customer-browse-5k.js')],env=env,stdout=log,stderr=log,timeout=60+hold+(30 if hold==120 else 60)+90)
                    code=p.returncode;load_finished_at=now()
                finally:observer.terminate();observer.wait(10)
            (folder/'exit.txt').write_text(str(code))
            for name in ['k6.json','k6.log','generator.jsonl','exit.txt','fd-limit.txt']:
                if (folder/name).exists():upload(job,name)
        send('/status/'+job,{'job_id':job,'phase':'complete','exit':code,'observed_at':now(),**({'load_finished_at':load_finished_at} if task['action']=='run' else {})})
    except Exception:
        send('/status/'+job,{'job_id':job,'phase':'failed','error':'worker operation failed (details suppressed)','observed_at':now()})
    time.sleep(3)
