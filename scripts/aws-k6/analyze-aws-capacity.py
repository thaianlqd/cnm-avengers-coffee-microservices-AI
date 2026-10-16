#!/usr/bin/env python3
"""Combine HTTP, target stability, actual FD limit, generator and recovery gates."""
import datetime as dt,gzip,importlib.util,json,re,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('metrics',Path(__file__).with_name('analyze-3k.py'));metrics=importlib.util.module_from_spec(s);s.loader.exec_module(metrics)
def parsed_resource_metrics(row,kind,memory_index):
    values=[]
    for line in row.get(kind,'').splitlines():
        parts=line.split()
        if len(parts)<=memory_index:continue
        try:
            cpu=float(parts[1][:-1]) if parts[1].endswith('m') else float(parts[1])*1000
            match=re.fullmatch(r'([0-9.]+)(Ki|Mi|Gi)',parts[memory_index])
            if not match:continue
            memory=float(match[1])*{'Ki':1/1024,'Mi':1,'Gi':1024}[match[2]]
        except ValueError:continue # kubectl top may emit <unknown>; never replace by zero.
        values.append((parts[0],{'cpu_millicores':cpu,'memory_MiB':memory}))
    return values

def complete_resource_metrics(row):
    nodes=parsed_resource_metrics(row,'top_nodes',3);pods=parsed_resource_metrics(row,'top_pods',2)
    return bool(nodes and pods) and len(nodes)==len(row.get('nodes',[])) and len(pods)==len(row.get('top_pods','').splitlines())

def resource_peaks(rows):
    nodes={};pods={};cluster={'cpu_millicores':None,'memory_MiB':None};incomplete=0
    for row in rows:
        totals={'cpu_millicores':0,'memory_MiB':0}
        for kind,target,memory_index in [('top_nodes',nodes,3),('top_pods',pods,2)]:
            for name,values in parsed_resource_metrics(row,kind,memory_index):
                peak=target.setdefault(name,{'cpu_millicores':0,'memory_MiB':0})
                for key,value in values.items():
                    peak[key]=max(peak[key],value)
                    if kind=='top_nodes':totals[key]+=value
        # A partial node sum is not a complete cluster observation.
        node_values=parsed_resource_metrics(row,'top_nodes',3)
        expected_nodes=len(row['nodes']) if 'nodes' in row else len(row.get('top_nodes','').splitlines())
        if node_values and len(node_values)==expected_nodes==len(row.get('top_nodes','').splitlines()):
            for key,value in totals.items():cluster[key]=max(cluster[key] or 0,value)
        else:incomplete+=1
    return {'nodes':nodes,'pods':pods,'cluster_sampled_peak':cluster,'incomplete_node_metric_samples':incomplete,'complete_node_metric_samples':len(rows)-incomplete}

def analyze(folder):
    meta=json.loads((folder/'metadata.json').read_text());summary=json.loads((folder/'k6.json').read_text())['metrics']
    rows=list(metrics.lines(folder/'target.jsonl'));samples=list(metrics.lines(folder/'generator.jsonl'))
    start=dt.datetime.fromisoformat(meta['load_started_at']);hold_start=start+dt.timedelta(seconds=60);hold_end=hold_start+dt.timedelta(seconds=meta['hold_seconds'])
    reasons=[];g=metrics.generator(samples);streak=longest=0
    for interval in g['cpu_intervals']:
        streak=streak+1 if interval['busy_percent']>=90 else 0;longest=max(longest,streak)
    gcov=metrics.hold_coverage(g['cpu_intervals'],hold_start,hold_end)
    tcov=metrics.hold_coverage(rows,hold_start,hold_end)
    generator_reasons=[]
    if longest>=3:generator_reasons.append('generator CPU >=90% for three consecutive intervals')
    if (g['memory_available_min_KiB'] or 0)<262144:generator_reasons.append('generator available RAM <256MiB')
    if g['k6_fds_peak']>=float(meta['fd_soft'])*.8:generator_reasons.append('generator FD headroom <20%')
    if not gcov['sufficient']:generator_reasons.append('generator hold observer coverage invalid')
    ena_deltas={}
    if samples:
        for iface,values in samples[-1].get('ena',{}).items():
            for name,v in values.items():ena_deltas[iface+'/'+name]=v-samples[0].get('ena',{}).get(iface,{}).get(name,v)
    if any(v>0 for v in ena_deltas.values()):generator_reasons.append('generator ENA allowance exceeded')
    if not samples or sum(r.get('ena_valid') is True for r in samples)<len(samples)*.8:generator_reasons.append('generator ENA observer coverage invalid')
    log_path=folder/'k6.log'
    if log_path.exists():log=log_path.read_text()
    elif (folder/'k6.log.gz').exists():
        with gzip.open(folder/'k6.log.gz','rt') as stream:log=stream.read()
    else:raise ValueError('missing k6 log for socket exhaustion review')
    if any(t in log for t in ('too many open files','cannot assign requested address','socket exhaustion')):generator_reasons.append('generator socket exhaustion')
    required=('http_req_failed','checks','http_req_duration','http_req_failed{phase:hold}','checks{phase:hold}','http_req_duration{phase:hold}','http_reqs{phase:hold}')
    http_pass=all(summary.get(k,{}).get('thresholds') for k in required) and all(t.get('ok') is True for m in summary.values() for t in m.get('thresholds',{}).values())
    if not http_pass:reasons.append('HTTP thresholds failed')
    if not tcov['sufficient']:reasons.append('target hold observer coverage invalid')
    vu_stage=None
    if meta.get('generator_count',1)==1:
        path=folder/'stage-vus.jsonl.gz'
        if path.exists():
            all_vus=[r for r in metrics.lines(path) if r['metric']=='vus']
            hold_vus=[r for r in all_vus if hold_start<=dt.datetime.fromisoformat(r['observed_at'].replace('Z','+00:00'))<=hold_end]
            coverage=metrics.hold_coverage(hold_vus,hold_start,hold_end)
            fraction=sum(r['value']==meta['vus'] for r in hold_vus)/len(hold_vus) if hold_vus else 0
            vu_stage={'actual_vu_peak':max((r['value'] for r in all_vus),default=0),'hold_target_fraction':fraction,'hold_coverage':coverage}
            if not coverage['sufficient'] or fraction<.95:reasons.append('requested VUs not sustained during hold')
        else:reasons.append('actual VU timeline missing')
    expected_hpa={'api-gateway','identity-service','menu-service'}
    complete=[r for r in rows if r.get('nodes') and r.get('pods') and complete_resource_metrics(r) and {h['name'] for h in r.get('hpa',[])}==expected_hpa]
    complete_coverage=metrics.hold_coverage(complete,hold_start,hold_end)
    if not complete_coverage['sufficient']:reasons.append('complete HPA/Pod/node metric evidence missing during hold')
    if not rows:reasons.append('missing target observations')
    initial={p['uid']:sum(c.get('restartCount',0) for c in p.get('containers',[])) for p in rows[0].get('pods',[])} if rows else {}
    restarts={};peak={};node_peak=0;pending=0;invalid_hpa=0
    for row in rows:
        if row.get('observer_error'):reasons.append('target observer operation failed')
        for p in row.get('pods',[]):
            restarts[p['uid']]=max(restarts.get(p['uid'],0),sum(c.get('restartCount',0) for c in p.get('containers',[])))
            if p['phase']=='Pending':pending+=1
            for c in p.get('containers',[]):
                for st in ('state','lastState'):
                    if c.get(st,{}).get('terminated',{}).get('reason')=='OOMKilled':reasons.append('OOMKilled')
                if c.get('state',{}).get('waiting',{}).get('reason')=='CrashLoopBackOff':reasons.append('CrashLoopBackOff')
        for n in row.get('nodes',[]):
            for c in n['conditions']:
                if c['type'].endswith('Pressure') and c['status']=='True':reasons.append('node '+c['type'])
                if c['type']=='Ready' and c['status']!='True':reasons.append('node not Ready')
        for h in row.get('hpa',[]):
            status=h['status'];peak[h['name']]=max(peak.get(h['name'],0),status.get('currentReplicas',0),status.get('desiredReplicas',0))
            if not status.get('currentMetrics') or not any(c['type']=='ScalingActive' and c['status']=='True' for c in status.get('conditions',[])):invalid_hpa+=1
        for line in row.get('top_nodes','').splitlines():
            fields=line.split()
            if len(fields)>=3 and fields[2].endswith('%'):node_peak=max(node_peak,float(fields[2][:-1]))
    delta=sum(max(0,v-initial.get(uid,0)) for uid,v in restarts.items())
    if delta:reasons.append('new Pod restarts')
    if invalid_hpa:reasons.append('HPA metrics invalid in '+str(invalid_hpa)+' samples')
    smoke=json.loads((folder/'post-smoke.json').read_text()) if (folder/'post-smoke.json').exists() else {}
    recovery=json.loads((folder/'recovery.json').read_text()) if (folder/'recovery.json').exists() else {}
    if smoke.get('passed') is not True:reasons.append('post-load smoke missing/failed')
    if recovery.get('passed') is not True:reasons.append('natural recovery missing/failed')
    reasons=list(dict.fromkeys(reasons))
    def value(name,key):return summary.get(name,{}).get('values',{}).get(key)
    result={'vus':meta['vus'],'hold_seconds':meta['hold_seconds'],'requests':value('http_reqs','count'),'rps':value('http_reqs','rate'),'failure_rate':value('http_req_failed','rate'),'check_rate':value('checks','rate'),'p95_ms':value('http_req_duration','p(95)'),'hold_p95_ms':value('http_req_duration{phase:hold}','p(95)'),'p99_ms':value('http_req_duration','p(99)'), 'http_pass':http_pass,'restart_delta':delta,'hpa_peak':peak,'node_cpu_peak_percent':node_peak,'pending_pod_samples':pending,'target_hold_coverage':tcov,'generator':g,'generator_hold_coverage':gcov,'generator_cpu_saturation_longest_samples':longest,'ena_allowance_deltas':ena_deltas,'generator_adequate':not generator_reasons,'generator_reasons':generator_reasons,'target_reasons':reasons,'post_smoke':smoke.get('passed'),'natural_recovery':recovery.get('passed'),'status':'STABLE PASS' if not reasons and not generator_reasons else 'INVALID GENERATOR' if generator_reasons else 'FAIL'}
    count=meta.get('generator_count',1)
    result.update(p50_ms=value('http_req_duration','p(50)'),p90_ms=value('http_req_duration','p(90)'),max_latency_ms=value('http_req_duration','max'),resources=resource_peaks(rows),complete_metric_hold_coverage=complete_coverage,vu_stage=vu_stage)
    if count!=1:
        if count not in (2,3) or not isinstance(meta.get('start_skew_seconds'),(int,float)) or not 0<=meta['start_skew_seconds']<=2:
            raise ValueError('invalid distributed synchronization evidence')
        names=meta.get('generator_folders',['generator'+str(i+1) for i in range(count)])
        if len(names)!=count or len(set(names))!=count or any(not re.fullmatch(r'generator[1-3]',n) for n in names):
            raise ValueError('invalid generator partition manifest')
        if any(not (folder/n).is_dir() for n in names):raise ValueError('missing generator partition')
        shards={n:analyze(folder/n) for n in names}
        result['generators']=shards
        result['generator_count']=count
        result['start_skew_seconds']=meta['start_skew_seconds']
        result['generator_adequate']=all(v['generator_adequate'] for v in shards.values())
        result['generator_reasons']=[n+': '+r for n,v in shards.items() for r in v['generator_reasons']]
        result['generator_cpu_peak_percent']=max(v['generator']['cpu_busy_peak_percent'] for v in shards.values())
        # HTTP quality is measured over the merged observations. Every generator
        # must independently satisfy resource, coverage and socket adequacy.
        result['target_reasons']=list(dict.fromkeys(reasons+[n+': '+r for n,v in shards.items() for r in v['target_reasons'] if r!='HTTP thresholds failed']))
        result['status']='INVALID GENERATOR' if not result['generator_adequate'] else 'FAIL' if result['target_reasons'] else 'STABLE PASS'
    if meta.get('diagnostic') is True:
        result['observed_gate_status']=result['status'];result['qualification_eligible']=False;result['status']='DIAGNOSTIC (NOT QUALIFICATION)'
    (folder/'analysis.json').write_text(json.dumps(result,indent=2)+'\n');return result
if __name__=='__main__':print(json.dumps(analyze(Path(sys.argv[1])),indent=2))
