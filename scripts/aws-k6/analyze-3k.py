#!/usr/bin/env python3
"""Summarize external path and Linux generator evidence, without response bodies."""
import datetime as dt, gzip, json, math, sys
from collections import Counter, defaultdict
from pathlib import Path

def lines(path):
    if not path.exists() and Path(str(path)+'.gz').exists(): path=Path(str(path)+'.gz')
    with (gzip.open(path,'rt') if path.suffix=='.gz' else path.open()) as stream:
        for line in stream:
            if line.strip(): yield json.loads(line)

def percentile(values,p=0.95):
    if not values: return None
    values.sort(); index=(len(values)-1)*p; low=int(index); high=math.ceil(index)
    return values[low]+(values[high]-values[low])*(index-low)

def hold_coverage(intervals,start,end):
    selected=[r for r in intervals if start<=dt.datetime.fromisoformat(r['observed_at'])<=end]
    times=[dt.datetime.fromisoformat(r['observed_at']) for r in selected]
    gaps=[(b-a).total_seconds() for a,b in zip([start]+times,times+[end])]
    duration=(end-start).total_seconds()
    return {'intervals':len(selected),'expected_intervals':duration/5,
            'max_gap_seconds':max(gaps,default=duration),
            'sufficient':len(selected)>=duration/5*.8 and max(gaps,default=duration)<=15}

def generator(samples):
    out={'samples':len(samples),'cpu_busy_peak_percent':0,'k6_cpu_peak_core_percent':0,
         'k6_rss_peak_bytes':0,'k6_fds_peak':0,'memory_available_min_KiB':None,'network_rx_peak_bytes_s':0,'network_tx_peak_bytes_s':0}
    for r in samples:
        available=r['memory_KiB']['MemAvailable']
        out['memory_available_min_KiB']=min(out['memory_available_min_KiB'] or available,available)
        for p in r['processes']:
            if p['name']=='k6':
                out['k6_rss_peak_bytes']=max(out['k6_rss_peak_bytes'],p['rss_bytes'])
                out['k6_fds_peak']=max(out['k6_fds_peak'],p['fds'])
    out['cpu_intervals']=[]
    for a,b in zip(samples,samples[1:]):
        seconds=(dt.datetime.fromisoformat(b['observed_at'])-dt.datetime.fromisoformat(a['observed_at'])).total_seconds()
        if seconds<=0: continue
        ticks=[y-x for x,y in zip(a['cpu_ticks'][:8],b['cpu_ticks'][:8])]; total=sum(ticks)
        if total>0:
            busy=100*(total-ticks[3]-ticks[4])/total
            out['cpu_busy_peak_percent']=max(out['cpu_busy_peak_percent'],busy)
            out['cpu_intervals'].append({'observed_at':b['observed_at'],'busy_percent':busy})
        old={p['pid']:p for p in a['processes']}
        for p in b['processes']:
            if p['name']=='k6' and p['pid'] in old:
                q=old[p['pid']]; used=p['user_ticks']+p['system_ticks']-q['user_ticks']-q['system_ticks']
                # Ubuntu CLK_TCK=100, recorded in bootstrap evidence.
                out['k6_cpu_peak_core_percent']=max(out['k6_cpu_peak_core_percent'],used/seconds)
        for iface,v in b['network_bytes'].items():
            if iface=='lo' or iface not in a['network_bytes']:continue
            for direction in ['rx','tx']:
                key='network_'+direction+'_peak_bytes_s'
                out[key]=max(out[key],(v[direction]-a['network_bytes'][iface][direction])/seconds)
    return out

def analyze(folder):
    statuses=Counter(); hold_statuses=Counter(); durations=defaultdict(list); timings=defaultdict(list)
    for r in (lines(folder/'http-points.jsonl.gz') if (folder/'http-points.jsonl.gz').exists() else []):
        if r.get('type')!='Point':continue
        d=r['data']; tags=d.get('tags',{}); metric=r['metric']; phase=tags.get('phase')
        if metric=='response_statuses':
            statuses[tags['status']]+=d['value']
            if phase=='hold':hold_statuses[tags['status']]+=d['value']
        if metric=='http_req_duration': durations[(tags.get('name'),phase)].append(d['value'])
        if metric in ['http_req_connecting','http_req_tls_handshaking','http_req_waiting','http_req_receiving','http_req_blocked']:
            timings[metric].append(d['value'])
    m=json.loads((folder/'k6.json').read_text())['metrics']
    if not statuses:
        statuses.update({k.split('status:')[1].split('}')[0]:v['values']['count'] for k,v in m.items() if k.startswith('response_statuses{status:')})
    out={'response_status_counts':dict(statuses),'hold_status_counts':dict(hold_statuses),
         'route_phase_p95_ms':{name+' / '+phase:percentile(v) for (name,phase),v in durations.items()},
         'timing_p95_ms':{name:percentile(v) for name,v in timings.items()},
         'generator':generator(list(lines(folder/'generator.jsonl')))}
    if not timings:out['timing_p95_ms']={k:v['values'].get('p(95)') for k,v in m.items() if k.startswith(('http_req_connecting','http_req_tls_handshaking','http_req_waiting','http_req_receiving','http_req_blocked'))}
    if not durations:out['route_phase_p95_ms']={k:v['values'].get('p(95)') for k,v in m.items() if '_ms{phase:hold}' in k}
    out['p99_ms']=m['http_req_duration']['values'].get('p(99)')
    out['hold_p99_ms']=m['http_req_duration{phase:hold}']['values'].get('p(99)')
    out['route_p99_ms']={k:v['values'].get('p(99)') for k,v in m.items() if '_ms' in k}
    meta=json.loads((folder/'metadata.json').read_text())
    hold_start=dt.datetime.fromisoformat(meta['load_started_at'])+dt.timedelta(seconds=meta['ramp_seconds'])
    hold_end=hold_start+dt.timedelta(seconds=meta['hold_seconds'])
    streak=maximum=0
    for r in out['generator']['cpu_intervals']:
        t=dt.datetime.fromisoformat(r['observed_at'])
        if not hold_start<=t<=hold_end:continue
        streak=streak+1 if r['busy_percent']>=90 else 0;maximum=max(maximum,streak)
    reasons=[]
    if maximum>=3:reasons.append('loadgen CPU >=90% for >=3 consecutive ~5s intervals during hold')
    if (out['generator']['memory_available_min_KiB'] or 0)<256*1024:reasons.append('loadgen available memory <256MiB')
    if out['generator']['k6_fds_peak']>=65536*.8:reasons.append('loadgen descriptor headroom <20%')
    if out['generator']['samples']<20:reasons.append('loadgen observer coverage insufficient')
    coverage=hold_coverage(out['generator']['cpu_intervals'],hold_start,hold_end)
    out['generator']['hold_coverage']=coverage
    if not coverage['sufficient']:reasons.append('hold observer coverage <80% or gap >15s')
    log=(folder/'k6.log').read_text() if (folder/'k6.log').exists() else ''
    exhaustion={token:log.count(token) for token in ['too many open files','cannot assign requested address','socket exhaustion']}
    out['generator']['socket_exhaustion_mentions']=exhaustion
    if any(exhaustion.values()):reasons.append('socket/descriptor exhaustion reported by k6')
    # TCP retransmits/resets are evidence, not automatically a generator failure.
    samples=list(lines(folder/'generator.jsonl'))
    out['generator']['tcp_counter_deltas']={k:samples[-1].get('tcp',{}).get(k,0)-samples[0].get('tcp',{}).get(k,0)
        for k in ['RetransSegs','InErrs','OutRsts']} if samples else {}
    network_file=folder/'network-adequacy.json'
    network=json.loads(network_file.read_text()) if network_file.exists() else {}
    out['network_review']=network
    if network.get('adequate') is not True or not network.get('evidence'):
        reasons.append('network adequacy review with evidence required')
    out['adequacy']={'policy_declared_before_external_baseline':True,'hold_cpu_saturation_longest_intervals':maximum,
        'generator_and_path_adequate':not reasons,'reasons':reasons}
    (folder/'external-analysis.json').write_text(json.dumps(out,indent=2)+'\n')
    target=json.loads((folder/'result.json').read_text())
    qualification={'target_result':target['status'],'qualified_run':target['status']=='STABLE PASS' and not reasons,
        'status':target['status'] if not reasons else 'NOT QUALIFIED (generator/network adequacy)', 'adequacy_reasons':reasons}
    (folder/'qualification.json').write_text(json.dumps(qualification,indent=2)+'\n')
    return out

if __name__=='__main__': print(json.dumps(analyze(Path(sys.argv[1])),indent=2))
