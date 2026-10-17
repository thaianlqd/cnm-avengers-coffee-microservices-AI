#!/usr/bin/env python3
"""Follow opt-in numeric diagnostics across HPA Pod deletion; discard all other logs."""
import argparse,datetime,json,math,re,signal,subprocess,threading,time
from pathlib import Path
SERVICES={'api-gateway','identity-service','menu-service','news-service'}
STAGES={'request','upstream_headers','upstream_body','cache_hit','cache_refresh','cache_coalesced','cache_wait','load','serialize','gzip','identity_bytes','gzip_bytes','db_acquire','db_query','db_connect','db_error','gateway_dispatch','socket_wait','dns_lookup','dns_error','tcp_connect','tls_connect','upstream_connect','upstream_ttfb','upstream_response_wait','upstream_total','socket_new','socket_reused','socket_preconnected','upstream_error','upstream_abort','upstream_failed_total','agent_queue_depth','agent_active_sockets','agent_idle_sockets','slow_socket_wait','slow_dns','slow_connect','slow_response_wait','slow_unattributed'}

def number(value):return type(value) in (int,float) and math.isfinite(value) and value>=0

def sanitize(line):
    try:
        if not line.lstrip().startswith('{'):line=line.split(' ',1)[1]
        row=json.loads(line)
        if row.get('kind')!='capacity_diagnostics' or not number(row.get('interval_ms')) or not 0<row['interval_ms']<=300000:return None
        datetime.datetime.fromisoformat(row['at'].replace('Z','+00:00'))
        if not re.fullmatch(r'[0-9T:.+Z-]{20,40}',row['at']):return None
        metrics={}
        for key,value in row.get('metrics',{}).items():
            match=re.fullmatch(r'(categories|products|branches|news):([a-z_]+)',key)
            if not match or match[2] not in STAGES:continue
            if not all(number(value.get(k)) for k in ('count','sum','max')):continue
            buckets=value.get('buckets',[])
            if not isinstance(buckets,list) or not 1<=len(buckets)<=32 or not all(type(v) is int and v>=0 for v in buckets):continue
            metrics[key]={k:value[k] for k in ('count','sum','max','buckets')}
        bounds=row.get('bounds_ms',[])
        if not isinstance(bounds,list) or not 1<=len(bounds)<=32 or not all(number(v) or v=='Inf' for v in bounds):return None
        loop={k:v for k,v in row.get('event_loop_ms',{}).items() if k in ('p50','p95','p99','max') and number(v)}
        result={'kind':'capacity_diagnostics','at':row['at'],'interval_ms':row['interval_ms'],'bounds_ms':bounds,'metrics':metrics,'event_loop_ms':loop}
        if 'metric_units' in row:result['metric_units']={k:v for k,v in row['metric_units'].items() if k in metrics and v in ('ms','count','bytes')}
        return result
    except (ValueError,TypeError,KeyError,AttributeError,IndexError):return None

def stream(folder,seconds):
    stop=threading.Event();signal.signal(signal.SIGTERM,lambda *_:stop.set());signal.signal(signal.SIGINT,lambda *_:stop.set());lock=threading.Lock();seen=set();children={};attempts={};threads=[];stats={};deadline=time.monotonic()+seconds;since=(folder/'started-at').read_text().strip()
    def follow(proc,pod,service,out):
        for line in proc.stdout:
            record=sanitize(line)
            if record is None:continue
            key=(pod['uid'],record['at'])
            with lock:
                if key in seen:continue
                seen.add(key);stats[pod['uid']]['records']+=1
                out.write(json.dumps({'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'service':service,'pod':pod['name'],'uid':pod['uid'],'record':record})+'\n');out.flush()
    with (folder/'diagnostics.jsonl').open('w') as output,(folder/'target.jsonl').open() as source:
        while time.monotonic()<deadline and not stop.is_set():
            position=source.tell();line=source.readline()
            if not line or not line.endswith('\n'):source.seek(position);stop.wait(.5);continue
            try:row=json.loads(line)
            except ValueError:continue
            for pod in row.get('pods',[]):
                service=next((s for s in SERVICES if pod['name'].startswith(s+'-')),None)
                if not service or pod.get('phase')!='Running':continue
                uid=pod['uid'];previous=children.get(uid)
                if previous is not None and previous.poll() is None:continue
                if attempts.get(uid,0)>=3:continue
                attempts[uid]=attempts.get(uid,0)+1;stats.setdefault(uid,{'service':service,'pod':pod['name'],'records':0})
                command=['k3s','kubectl','--request-timeout=0','-n','avengers-coffee','logs','--follow','--timestamps','--tail=1000','--since-time='+since,pod['name'],'-c',service]
                proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True);children[uid]=proc
                thread=threading.Thread(target=follow,args=(proc,pod,service,output),daemon=True);thread.start();threads.append(thread)
        for proc in children.values():
            if proc.poll() is None:proc.terminate()
        for proc in children.values():
            try:proc.wait(timeout=3)
            except subprocess.TimeoutExpired:proc.kill();proc.wait()
        for thread in threads:thread.join(timeout=3)
    (folder/'diagnostic-stream-status.json').write_text(json.dumps({'pods':stats,'attempts':attempts,'records':len(seen),'raw_other_logs_retained':False,'owned_log_processes_stopped':all(p.poll() is not None for p in children.values())},indent=2)+'\n')

def classify_metrics_logs(text,node_aliases):
    buckets={}
    for line in text.splitlines():
        parts=line.split(' ',1)
        if len(parts)!=2:continue
        try:at=datetime.datetime.fromisoformat(parts[0].replace('Z','+00:00'))
        except ValueError:continue
        lower=parts[1].lower();category=next((name for name,terms in [('timeout',('timeout','deadline exceeded')),('tls',('certificate','x509')),('connect',('connection refused','no route to host','network is unreachable')),('not_ready',('no metrics to serve','not ready')),('scrape',('unable to fully scrape','failed to scrape')),('other_error',('error','failed'))] if any(t in lower for t in terms)),None)
        if category is None:continue
        node=next((alias for needle,alias in node_aliases.items() if re.search(r'(?<![A-Za-z0-9_.-])'+re.escape(needle)+r'(?![A-Za-z0-9_.-])',parts[1])),'unknown');stamp=datetime.datetime.fromtimestamp(int(at.timestamp()//5)*5,datetime.timezone.utc).isoformat();key=(stamp,node,category);buckets[key]=buckets.get(key,0)+1
    return [{'observed_at':at,'node':node,'category':category,'count':count} for (at,node,category),count in sorted(buckets.items())]

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('folder',type=Path);p.add_argument('--seconds',type=int,default=1320);a=p.parse_args()
    if not 30<=a.seconds<=14400:raise SystemExit('invalid observer lifetime')
    stream(a.folder,a.seconds)
