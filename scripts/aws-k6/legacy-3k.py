#!/usr/bin/env python3
"""One clean historical moderate run; no AWS/tunnel or workload changes."""
import hashlib, json, os, subprocess, threading, time
from pathlib import Path
import session as shared
cap=shared.cap

def host():
    text=cap.command(['top','-l','1','-n','0'])[1]
    r={'host':'\n'.join(l for l in text.splitlines() if l.startswith(('CPU usage:','PhysMem:','VM:','Load Avg:'))),
       'swap':cap.command(['sysctl','vm.swapusage'])[1].strip()}
    rows=[]
    for line in cap.command(['ps','-ax','-o','pid=,pcpu=,rss=,comm='])[1].splitlines():
        v=line.split(None,3)
        if len(v)==4:rows.append({'pid':int(v[0]),'cpu':float(v[1]),'rss_KiB':int(v[2]),'name':Path(v[3]).name})
    r['host_processes_by_cpu']=sorted(rows,key=lambda p:p['cpu'],reverse=True)[:10]
    r['network_counters']=cap.command(['netstat','-ibn'])[1]  # sanitized below: no addresses
    safe=[]
    for l in r['network_counters'].splitlines()[1:]:
        v=l.split()
        if len(v)>=11 and v[2].startswith('<Link#'):
            safe.append({'interface':v[0],'rx_bytes':int(v[6]),'tx_bytes':int(v[9])})
    r['network_counters']=safe
    return r

def main():
    if os.getenv('K8S_DB_MODE')!='existing':raise RuntimeError('existing DB mode required')
    folder=Path('/tmp/avengers-aws-k6-3k/legacy-200');folder.mkdir(parents=True,mode=0o700)
    if (folder/'metadata.json').exists():raise RuntimeError('Evidence exists; refusing accidental retry')
    for line in cap.command(['ps','-ax','-o','comm='])[1].splitlines():
        if Path(line.strip()).name in ['k6','cloudflared','ssh']:raise RuntimeError('Existing benchmark/SSH process; reconcile before clean baseline')
    flags=shared.call(cap.K+['-n','avengers-coffee','get','configmap','avengers-common','-o','jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}']).stdout.strip()
    if flags!='true 5000':raise RuntimeError('Read-only/cache policy changed')
    for args in [['python3','scripts/k8s/environment.py','audit'],['bash','scripts/k8s/check-connectivity.sh'],['bash','scripts/k8s/smoke.sh']]:
        (folder/(Path(args[-1]).stem+'-before.txt')).write_text(shared.call(args,120).stdout)
    with (folder/'pre-cooldown.jsonl').open('w') as out:before=cap.wait_recovery(out,720)
    shared.write(folder/'before.json',before)
    idle=host();idle['docker_resources']=shared.call(['docker','info','--format','{{.NCPU}} {{.MemTotal}}']).stdout.strip()
    idle['docker_stats']=shared.call(['docker','stats','--no-stream','--format','{{.Name}} {{.CPUPerc}} {{.MemUsage}}']).stdout
    shared.write(folder/'idle.json',idle)
    binary=shared.ROOT/'.tools/k6/0.57.0/k6';profile=shared.ROOT/'load-tests/k6/customer-browse.js'
    meta={'started_at':cap.now(),'vus':200,'hold_seconds':60,'profile':'legacy moderate unchanged','think_seconds':1,
          'source_head':shared.call(['git','rev-parse','HEAD']).stdout.strip(),'dirty_diff':shared.call(['git','diff','--stat']).stdout,
          'k6_version':shared.call([str(binary),'version']).stdout.strip(),'workload_sha256':hashlib.sha256(profile.read_bytes()).hexdigest()}
    shared.write(folder/'metadata.json',meta)
    stop=threading.Event();samples=[];pid=[None];phase=['preload'];errors=[]
    def observe():
        try:
            with (folder/'observer.jsonl').open('w') as out:
                while not stop.is_set():
                    r=cap.snapshot();r.update(host());r['phase']=phase[0];r['gateway_cgroups']={}
                    if pid[0]:r['k6_process']=cap.command(['ps','-p',str(pid[0]),'-o','%cpu=,rss=,time='])[1].strip()
                    for p in r['pods']:
                        if p['app']=='api-gateway' and not p['deleting']:
                            code,text=cap.command(cap.K+['-n','avengers-coffee','exec',p['name'],'--','cat','/sys/fs/cgroup/cpu.stat','/sys/fs/cgroup/memory.events'])
                            if not code:r['gateway_cgroups'][p['uid']]=dict(l.split() for l in text.splitlines() if len(l.split())==2)
                    samples.append(r);out.write(json.dumps(r)+'\n');out.flush()
                    if r.get('compose_application_overlap') and pid[0]:os.kill(pid[0],2)
                    stop.wait(10)
        except Exception:errors.append('observer failed')
    observer=threading.Thread(target=observe);observer.start()
    try:
        with (folder/'k6.log').open('w') as log:
            env={**os.environ,'PROFILE':'moderate','BASE_URL':'http://127.0.0.1:3000','SUMMARY_FILE':str(folder/'k6.json')}
            for k in ['THINK_SECONDS','WARMUP_VUS','STEP1_VUS','STEP2_VUS','STEP3_VUS','STEP4_VUS']:env.pop(k,None)
            p=subprocess.Popen([str(binary),'run',str(profile)],env=env,cwd=shared.ROOT,stdout=log,stderr=log)
            pid[0]=p.pid;phase[0]='load';meta['load_started_at']=cap.now();print('Clean legacy 200 running:',folder,flush=True)
            try:code=p.wait(270)
            except BaseException:p.terminate();p.wait(20);raise
            meta.update(k6_exit=code,load_finished_at=cap.now());pid[0]=None;phase[0]='cooldown'
        with (folder/'post-cooldown.jsonl').open('w') as out:after=cap.wait_recovery(out,720)
        shared.write(folder/'after.json',after)
        smoke=shared.call(['bash','scripts/k8s/smoke.sh'],120,False);(folder/'smoke-after.txt').write_text(smoke.stdout)
        issues=cap.violations(before,samples+[after])+errors
        if smoke.returncode:issues.append('post-smoke failed')
        shared.write(folder/'result.json',{'status':'STABLE PASS' if code==0 and not issues else 'FAIL','http_pass':code==0,'stable':not issues,'violations':issues})
    finally:
        stop.set();observer.join(45);meta['finished_at']=cap.now();shared.write(folder/'metadata.json',meta)
    result=shared.summary.summarize(folder)
    print(json.dumps({k:result[k] for k in ['status','requests','failure_rate','checks_rate','p95_ms','hpa_peak','new_restarts','host_busy_peak_percent','gateway_quota_counters']}),flush=True)

if __name__=='__main__':main()
