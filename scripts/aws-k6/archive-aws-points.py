#!/usr/bin/env python3
"""Keep sufficient numeric points for exact merge; store large original outside Git."""
import gzip
import hashlib
import json
import sys
import datetime
import math
from collections import Counter
from pathlib import Path

def time_windows(raw, output):
    """Five-second per-generator/route windows for HPA correlation, no bodies."""
    windows = {}
    allowed = {'menu_categories','menu_products','public_branches','public_news'}
    with gzip.open(raw,'rt') as stream:
        for line in stream:
            row=json.loads(line)
            if row.get('type')!='Point' or row['metric'] not in ('http_reqs','http_req_failed','checks','http_req_duration'):continue
            point=row['data'];tags=point.get('tags') or {};route=tags.get('name');phase=tags.get('phase')
            if route not in allowed or phase not in ('ramp','hold','down') or not point.get('time'):continue
            at=datetime.datetime.fromisoformat(point['time'].replace('Z','+00:00'));bucket=int(at.timestamp()//5)*5
            key=(bucket,phase,route)
            current=windows.setdefault(key,{'requests':0,'failures':0,'checks':0,'checks_passed':0,'latencies':[]})
            metric=row['metric'];value=point['value']
            if metric=='http_reqs':current['requests']+=value
            elif metric=='http_req_failed':current['failures']+=value
            elif metric=='checks':current['checks']+=1;current['checks_passed']+=value
            else:current['latencies'].append(value)
    records=[]
    for (bucket,phase,route),values in sorted(windows.items()):
        ordered=sorted(values.pop('latencies'));n=len(ordered)
        def quantile(p):
            position=(n-1)*p;lower=int(position);upper=math.ceil(position)
            return ordered[lower]+(ordered[upper]-ordered[lower])*(position-lower) if n else None
        records.append({'observed_at':datetime.datetime.fromtimestamp(bucket,datetime.timezone.utc).isoformat(),'seconds':5,'phase':phase,'route':route,**values,'latency_samples':n,'latency_sum_ms':sum(ordered),'p50_ms':quantile(.5),'p90_ms':quantile(.9),'p95_ms':quantile(.95),'p99_ms':quantile(.99),'max_ms':max(ordered,default=None)})
    with gzip.open(output,'wt') as stream:
        for row in records:stream.write(json.dumps(row,separators=(',',':'))+'\n')
    return len(records)


def archive(folder, raw_archive):
    raw = folder / 'http-points.jsonl.gz'
    compact = folder / 'metric-points.jsonl.gz'
    counts = Counter()
    stages = []
    raw_sha = hashlib.sha256(raw.read_bytes()).hexdigest()
    with gzip.open(raw, 'rt') as source, gzip.open(compact, 'wt', compresslevel=9) as destination:
        for line in source:
            row = json.loads(line)
            if row.get('type') != 'Point':
                continue
            metric = row['metric']
            if metric in ('vus','vus_max'):
                stages.append({'observed_at':row['data']['time'],'metric':metric,'value':row['data']['value']})
            if metric not in ('http_reqs', 'response_statuses', 'checks', 'http_req_failed', 'http_req_duration') and not metric.endswith('_ms') and not metric.startswith(('http_req_connecting', 'http_req_waiting', 'http_req_receiving', 'http_req_blocked', 'http_req_tls')):
                continue
            point = row['data']
            tags = point.get('tags') or {}
            destination.write(json.dumps([metric, point['value'], tags.get('phase'), tags.get('status'), tags.get('name')], separators=(',', ':')) + '\n')
            counts[metric] += 1
    with gzip.open(folder/'stage-vus.jsonl.gz','wt') as destination:
        for row in stages:destination.write(json.dumps(row,separators=(',',':'))+'\n')
    manifest = {'original_raw_sha256': raw_sha, 'original_raw_bytes': raw.stat().st_size, 'compact_sha256': hashlib.sha256(compact.read_bytes()).hexdigest(), 'compact_bytes': compact.stat().st_size, 'format': '[metric,value,phase,status,route_name]; exact numeric observations, no response bodies', 'metric_observation_counts': dict(counts), 'stage_vu_samples':len(stages),'actual_vu_peak':max((r['value'] for r in stages if r['metric']=='vus'),default=None)}
    (folder / 'metric-points-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    manifest['five_second_route_windows']=time_windows(raw,folder/'http-windows.jsonl.gz')
    (folder / 'metric-points-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    raw_archive.mkdir(parents=True, exist_ok=True)
    target = raw_archive / (raw_sha + '.jsonl.gz')
    if target.exists():
        raise ValueError('raw archive already exists')
    raw.rename(target)
    return manifest


if __name__ == '__main__':
    if sys.argv[1]=='windows':print(json.dumps({'windows':time_windows(Path(sys.argv[2]),Path(sys.argv[3]))}))
    else:print(json.dumps(archive(Path(sys.argv[1]), Path(sys.argv[2])), indent=2))
