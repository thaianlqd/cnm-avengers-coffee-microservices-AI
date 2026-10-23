import bisect,csv,datetime,gzip,importlib.util,json,pathlib,sys
root=pathlib.Path.cwd();spec=importlib.util.spec_from_file_location('analysis',root/'scripts/aws-k6/analyze-aws-capacity.py');analysis=importlib.util.module_from_spec(spec);spec.loader.exec_module(analysis)
def read(path):
    with gzip.open(path,'rt') as stream:return [json.loads(line) for line in stream if line.strip()]
def epoch(value):return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def correlate(point):
    targets=sorted(read(point/'target.jsonl.gz'),key=lambda r:epoch(r['observed_at']));times=[epoch(r['observed_at']) for r in targets]
    fields=['observed_at','phase','generator','route','actual_vus_sample','observer_lag_seconds','requests_5s','failures_5s','checks_passed','checks_total','generator_route_p95_ms','cluster_cpu_millicores','cluster_memory_MiB','resource_metrics_complete','generator_cpu_busy_percent','generator_memory_available_KiB','generator_k6_rss_bytes','generator_k6_fds','generator_sample_lag_seconds']
    apps=('api-gateway','identity-service','menu-service','news-service')
    fields+=[app+'_'+key for app in apps for key in ('replicas','desired','pod_cpu_total_m','pod_memory_total_MiB')]
    records=[]
    for generator in sorted(point.glob('generator[1-6]')):
        if not (generator/'http-windows.jsonl.gz').exists():continue
        vus=sorted((r for r in read(generator/'stage-vus.jsonl.gz') if r['metric']=='vus'),key=lambda r:epoch(r['observed_at']));vu_times=[epoch(r['observed_at']) for r in vus]
        samples=sorted(analysis.metrics.lines(generator/'generator.jsonl'),key=lambda r:epoch(r['observed_at']));sample_times=[epoch(r['observed_at']) for r in samples]
        cpu=analysis.metrics.generator(samples)['cpu_intervals'];cpu_times=[epoch(r['observed_at']) for r in cpu]
        for window in read(generator/'http-windows.jsonl.gz'):
            t=epoch(window['observed_at']);index=max(0,bisect.bisect_right(times,t)-1);target=targets[index];peaks=analysis.resource_peaks([target]);vi=bisect.bisect_right(vu_times,t+2.5)-1
            row={'observed_at':window['observed_at'],'phase':window['phase'],'generator':generator.name,'route':window['route'],'actual_vus_sample':vus[vi]['value'] if vi>=0 else None,'observer_lag_seconds':round(t-times[index],3),'requests_5s':window['requests'],'failures_5s':window['failures'],'checks_passed':window['checks_passed'],'checks_total':window['checks'],'generator_route_p95_ms':window['p95_ms'],'cluster_cpu_millicores':peaks['cluster_sampled_peak']['cpu_millicores'],'cluster_memory_MiB':peaks['cluster_sampled_peak']['memory_MiB']}
            si=bisect.bisect_right(sample_times,t+2.5)-1;ci=bisect.bisect_right(cpu_times,t+2.5)-1;sample=samples[si] if si>=0 else {};processes=[p for p in sample.get('processes',[]) if p['name']=='k6']
            row.update(resource_metrics_complete=analysis.complete_resource_metrics(target),generator_cpu_busy_percent=cpu[ci]['busy_percent'] if ci>=0 else None,generator_memory_available_KiB=sample.get('memory_KiB',{}).get('MemAvailable'),generator_k6_rss_bytes=sum(p['rss_bytes'] for p in processes) if processes else None,generator_k6_fds=sum(p['fds'] for p in processes) if processes else None,generator_sample_lag_seconds=round(t+2.5-sample_times[si],3) if si>=0 else None)
            if not row['resource_metrics_complete']:
                row['cluster_cpu_millicores']=None;row['cluster_memory_MiB']=None
            deployments={d['name']:d for d in target.get('deployments',[])}
            hpa={h['name']:h['status'] for h in target.get('hpa',[])}
            for app in apps:
                values=[v for name,v in peaks['pods'].items() if name.startswith(app+'-')]
                row.update({app+'_replicas':hpa.get(app,{}).get('currentReplicas',deployments.get(app,{}).get('status',{}).get('replicas')),app+'_desired':hpa.get(app,{}).get('desiredReplicas',deployments.get(app,{}).get('spec_replicas')),app+'_pod_cpu_total_m':sum(v['cpu_millicores'] for v in values) if values else None,app+'_pod_memory_total_MiB':sum(v['memory_MiB'] for v in values) if values else None})
            records.append(row)
    with (point/'correlation.csv').open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields,lineterminator="\n");writer.writeheader();writer.writerows(records)
    return len(records)
if __name__=='__main__':print(json.dumps({'rows':correlate(pathlib.Path(sys.argv[1])),'percentiles':'per-generator per-route windows; never averaged across generators'}))
