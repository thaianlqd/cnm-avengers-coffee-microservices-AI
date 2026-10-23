import bisect,csv,datetime,gzip,importlib.util,json,pathlib,sys
root=pathlib.Path.cwd();spec=importlib.util.spec_from_file_location('analysis',root/'scripts/aws-k6/analyze-aws-capacity.py');analysis=importlib.util.module_from_spec(spec);spec.loader.exec_module(analysis)
def read(path):
    with gzip.open(path,'rt') as stream:return [json.loads(line) for line in stream if line.strip()]
def epoch(value):return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def correlate(point):
    targets=sorted(read(point/'target.jsonl.gz'),key=lambda r:epoch(r['observed_at']));times=[epoch(r['observed_at']) for r in targets]
    fields=['observed_at','phase','generator','route','actual_vus_sample','observer_lag_seconds','requests_5s','failures_5s','checks_passed','checks_total','generator_route_p95_ms','cluster_cpu_millicores','cluster_memory_MiB']
    apps=('api-gateway','identity-service','menu-service','news-service')
    fields+=[app+'_'+key for app in apps for key in ('replicas','desired','pod_cpu_total_m','pod_memory_total_MiB')]
    records=[]
    for generator in sorted(point.glob('generator[1-3]')):
        if not (generator/'http-windows.jsonl.gz').exists():continue
        vus=sorted((r for r in read(generator/'stage-vus.jsonl.gz') if r['metric']=='vus'),key=lambda r:epoch(r['observed_at']));vu_times=[epoch(r['observed_at']) for r in vus]
        for window in read(generator/'http-windows.jsonl.gz'):
            t=epoch(window['observed_at']);index=max(0,bisect.bisect_right(times,t)-1);target=targets[index];peaks=analysis.resource_peaks([target]);vi=bisect.bisect_right(vu_times,t+2.5)-1
            row={'observed_at':window['observed_at'],'phase':window['phase'],'generator':generator.name,'route':window['route'],'actual_vus_sample':vus[vi]['value'] if vi>=0 else 0,'observer_lag_seconds':round(t-times[index],3),'requests_5s':window['requests'],'failures_5s':window['failures'],'checks_passed':window['checks_passed'],'checks_total':window['checks'],'generator_route_p95_ms':window['p95_ms'],'cluster_cpu_millicores':peaks['cluster_sampled_peak']['cpu_millicores'],'cluster_memory_MiB':peaks['cluster_sampled_peak']['memory_MiB']}
            hpa={h['name']:h['status'] for h in target.get('hpa',[])}
            for app in apps:
                values=[v for name,v in peaks['pods'].items() if name.startswith(app+'-')]
                row.update({app+'_replicas':hpa.get(app,{}).get('currentReplicas',1),app+'_desired':hpa.get(app,{}).get('desiredReplicas',1),app+'_pod_cpu_total_m':sum(v['cpu_millicores'] for v in values),app+'_pod_memory_total_MiB':sum(v['memory_MiB'] for v in values)})
            records.append(row)
    with (point/'correlation.csv').open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows(records)
    return len(records)
if __name__=='__main__':print(json.dumps({'rows':correlate(pathlib.Path(sys.argv[1])),'percentiles':'per-generator per-route windows; never averaged across generators'}))
