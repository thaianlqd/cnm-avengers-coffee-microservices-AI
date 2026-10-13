#!/usr/bin/env python3
"""Summarize sanitized capacity artifacts, retaining failed and aborted attempts."""
import json
import gzip
from pathlib import Path
import re
import sys


def evidence_text(folder, name):
    path = folder / name
    if path.exists():
        return path.read_text()
    compressed = folder / (name + '.gz')
    return gzip.decompress(compressed.read_bytes()).decode() if compressed.exists() else ''


def summarize(folder):
    meta = json.loads((folder / 'metadata.json').read_text())
    result = json.loads((folder / 'result.json').read_text()) if (folder / 'result.json').exists() else {'status': 'INCOMPLETE / ABORTED'}
    if (folder / 'aborted.json').exists():
        result.update(json.loads((folder / 'aborted.json').read_text()))
    if (folder / 'qualification-exclusion.json').exists():
        result['original_result_status'] = result['status']
        result['status'] = 'EXCLUDED (environment overlap)'
        result['qualification_exclusion'] = json.loads((folder / 'qualification-exclusion.json').read_text())
    m = json.loads((folder / 'k6.json').read_text())['metrics'] if (folder / 'k6.json').exists() else {}
    rows = [json.loads(l) for l in evidence_text(folder, 'observer.jsonl').splitlines()]
    peaks, service_peaks, hpas, probes, restarts = {}, {}, {}, {}, {}
    before = json.loads((folder / 'before.json').read_text()) if (folder / 'before.json').exists() else {'pods': [], 'events': []}
    initial_counts = {(p['uid'], c['name']): c['restartCount'] for p in before['pods'] for c in p['containers']}
    initial_events = {e['uid']: e['count'] for e in before['events']}
    host_busy = k6_cpu = k6_rss = 0
    throttled = {}
    cgroup_initial = {}
    for r in rows:
        totals = {}
        for label in ['top_nodes', 'top_pods']:
            for line in r.get(label, '').splitlines()[1:]:
                v = line.split()
                if len(v) < 3:
                    continue
                try:
                    cpu = int(v[1].rstrip('m'))
                    mem = int(v[3 if label == 'top_nodes' else 2].removesuffix('Mi'))
                except ValueError:
                    continue
                name = v[0] if label == 'top_nodes' else v[0].rsplit('-', 2)[0]
                peak = peaks.setdefault(name, {'cpu_m': 0, 'ram_Mi': 0})
                peak['cpu_m'] = max(peak['cpu_m'], cpu)
                peak['ram_Mi'] = max(peak['ram_Mi'], mem)
                if label == 'top_pods':
                    total = totals.setdefault(name, {'cpu_m': 0, 'ram_Mi': 0})
                    total['cpu_m'] += cpu
                    total['ram_Mi'] += mem
        for name, total in totals.items():
            peak = service_peaks.setdefault(name, {'cpu_m': 0, 'ram_Mi': 0})
            for metric in total:
                peak[metric] = max(peak[metric], total[metric])
        for h in r['hpa']:
            hpas[h['name']] = max(hpas.get(h['name'], 0), h.get('currentReplicas', 0))
        for p in r['pods']:
            for c in p['containers']:
                delta = c['restartCount'] - initial_counts.get((p['uid'], c['name']), 0)
                if delta > 0:
                    restarts[p['name'] + '/' + c['name']] = max(restarts.get(p['name'] + '/' + c['name'], 0), delta)
        for e in r['events']:
            if e['reason'] == 'Unhealthy' and e['count'] > initial_events.get(e['uid'], 0):
                probes[e['uid']] = {'object': e['object'], 'message': e['message'],
                                    'count': e['count'] - initial_events.get(e['uid'], 0)}
        idle = re.search(r'([\d.]+)% idle', r.get('host', ''))
        if idle:
            host_busy = max(host_busy, 100 - float(idle[1]))
        usage = r.get('k6_process', '').split()
        if len(usage) >= 2:
            k6_cpu = max(k6_cpu, float(usage[0])); k6_rss = max(k6_rss, int(usage[1]))
        for uid, counters in r.get('gateway_cgroups', {}).items():
            counters = {k: int(v) for k, v in counters.items()}
            old = cgroup_initial.setdefault(uid, counters)
            periods = counters.get('nr_periods', 0) - old.get('nr_periods', 0)
            n = counters.get('nr_throttled', 0) - old.get('nr_throttled', 0)
            if periods > 0 and n >= 0:
                throttled[uid] = {'periods': periods, 'throttled_periods': n,
                                  'fraction': n / periods, 'throttled_usec': counters.get('throttled_usec', 0) - old.get('throttled_usec', 0)}
    out = {'directory': folder.name, **meta, **result,
           'requests': m.get('http_reqs', {}).get('values', {}).get('count'),
           'rps': m.get('http_reqs', {}).get('values', {}).get('rate'),
           'successful_rps': (m.get('http_reqs', {}).get('values', {}).get('rate', 0) *
                              (1 - m.get('http_req_failed', {}).get('values', {}).get('rate', 0))) if m else None,
           'failure_rate': m.get('http_req_failed', {}).get('values', {}).get('rate'),
           'checks_rate': m.get('checks', {}).get('values', {}).get('rate'),
           'p95_ms': m.get('http_req_duration', {}).get('values', {}).get('p(95)'),
           'hold_metrics': {k: v['values'] for k, v in m.items() if 'phase:hold' in k},
           'hold_rps': m.get('http_reqs{phase:hold}', {}).get('values', {}).get('count', 0) / meta['hold_seconds'],
           'route_p95_ms': {k: v['values'].get('p(95)') for k, v in m.items() if k.endswith('_ms')},
           'peaks_per_pod_and_node': peaks, 'peaks_aggregate_service': service_peaks,
           'hpa_peak': hpas, 'new_restarts': restarts,
           'new_probe_failures': list(probes.values()), 'gateway_quota_counters': throttled,
           'host_busy_peak_percent': host_busy, 'k6_cpu_peak_one_core_percent': k6_cpu,
           'k6_rss_peak_KiB': k6_rss, 'observer_samples': len(rows)}
    out['k6_open_fds_peak'] = max((r.get('k6_open_fds', 0) for r in rows), default=0)
    log = evidence_text(folder, 'k6.log')
    if log:
        out['transport_error_mentions'] = {token: log.count(token) for token in
            ['request timeout', 'EOF', 'too many open files', 'cannot assign requested address', 'Insufficient VUs', 'connection refused']}
    (folder / 'analysis.json').write_text(json.dumps(out, indent=2) + '\n')
    return out


if __name__ == '__main__':
    destination = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/avengers-k8s-capacity')
    folders = [destination] if (destination / 'metadata.json').exists() else sorted(destination.glob('*'))
    for folder in folders:
        if not (folder / 'metadata.json').exists():
            continue
        out = summarize(folder)
        print(json.dumps({k: out[k] for k in ['directory', 'status', 'requests', 'failure_rate', 'p95_ms', 'rps',
                                            'hpa_peak', 'new_restarts', 'host_busy_peak_percent', 'k6_cpu_peak_one_core_percent',
                                            'peaks_per_pod_and_node']}, ensure_ascii=False))
