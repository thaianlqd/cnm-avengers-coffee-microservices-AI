#!/usr/bin/env python3
"""Merge actual k6 points, never average percentiles from shard summaries."""
import datetime as dt
import gzip
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        raise ValueError('missing latency observations')
    position = (len(ordered) - 1) * p
    lower = int(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def merge(folders):
    if not 2 <= len(folders) <= 6:
        raise ValueError('two to six generators required')
    if len({p.resolve() for p in folders}) != len(folders):
        raise ValueError('duplicate generator partition')
    metadata = [json.loads((p / 'metadata.json').read_text()) for p in folders]
    starts = [dt.datetime.fromisoformat(m['load_started_at']) for m in metadata]
    ends = [dt.datetime.fromisoformat(m['load_finished_at']) for m in metadata]
    skew = (max(starts) - min(starts)).total_seconds()
    if skew > 2 or len({m['hold_seconds'] for m in metadata}) != 1:
        raise ValueError('unsynchronized or different profiles')
    span = (max(ends) - min(starts)).total_seconds()
    values = defaultdict(list)
    counts = defaultdict(float)
    statuses = defaultdict(float)
    for folder in folders:
        summary = json.loads((folder / 'k6.json').read_text())['metrics']
        shard_requests = shard_checks = 0
        points = folder / 'http-points.jsonl.gz'
        if not points.exists():
            points = folder / 'metric-points.jsonl.gz'
        with gzip.open(points, 'rt') as stream:
            for line in stream:
                row = json.loads(line)
                if isinstance(row, list):
                    metric, value, phase, status, name = row
                    row = {'type': 'Point', 'metric': metric, 'data': {'value': value, 'tags': {'phase': phase, 'status': status, 'name': name}}}
                if row.get('type') != 'Point':
                    continue
                metric = row['metric']
                point = row['data']
                value = point['value']
                if not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError('invalid metric value')
                tags = point.get('tags') or {}
                keys = [metric]
                if tags.get('phase') == 'hold':
                    keys.append(metric + '{phase:hold}')
                if metric == 'http_reqs':
                    shard_requests += value
                if metric == 'checks':
                    shard_checks += 1
                if metric == 'response_statuses':
                    statuses[str(tags['status'])] += value
                for key in keys:
                    if metric in ('http_reqs', 'response_statuses'):
                        counts[key] += value
                    elif metric in ('http_req_failed', 'checks', 'http_req_duration') or metric.endswith('_ms') or metric.startswith(('http_req_connecting', 'http_req_waiting', 'http_req_receiving', 'http_req_blocked', 'http_req_tls')):
                        values[key].append(value)
        if shard_requests != summary['http_reqs']['values']['count']:
            raise ValueError('incomplete request output')
        check_summary = summary['checks']['values']
        if shard_checks != check_summary['passes'] + check_summary['fails']:
            raise ValueError('incomplete checks output')
    metrics = {}
    for key, samples in values.items():
        if key.startswith(('checks', 'http_req_failed')):
            rate = sum(samples) / len(samples)
            out = {'rate': rate, 'passes': sum(samples), 'fails': len(samples) - sum(samples)}
            threshold = 'rate>0.98' if key.startswith('checks') else 'rate<0.02'
            passed = rate > .98 if key.startswith('checks') else rate < .02
        else:
            out = {'avg': sum(samples) / len(samples), 'p(50)': percentile(samples, .5), 'p(90)': percentile(samples, .9), 'p(95)': percentile(samples, .95), 'p(99)': percentile(samples, .99), 'max': max(samples)}
            threshold = 'p(95)<1500' if key.startswith('http_req_duration') else 'p(95)>=0'
            passed = out['p(95)'] < 1500 if key.startswith('http_req_duration') else True
        metrics[key] = {'values': out, 'thresholds': {threshold: {'ok': passed}}}
    for key, count in counts.items():
        metrics[key] = {'values': {'count': count, 'rate': count / span}, 'thresholds': {'count>0': {'ok': count > 0}}}
    for status, count in statuses.items():
        metrics['response_statuses{status:' + status + '}'] = {'values': {'count': count}, 'thresholds': {'count>=0': {'ok': True}}}
    for phase in ('', '{phase:hold}'):
        if len(values['http_req_duration' + phase]) != counts['http_reqs' + phase] or len(values['http_req_failed' + phase]) != counts['http_reqs' + phase]:
            raise ValueError('incomplete HTTP observations')
    merged = dict(metadata[0], vus=sum(m['vus'] for m in metadata), load_started_at=min(starts).isoformat(), load_finished_at=max(ends).isoformat(), generator_count=len(folders), generator_folders=[p.name for p in folders], start_skew_seconds=skew, quantiles='linear interpolation over all actual observations', rps_duration_seconds=span)
    return {'metrics': metrics}, merged


if __name__ == '__main__':
    output = Path(sys.argv[1])
    summary, meta = merge([Path(p) for p in sys.argv[2:]])
    (output / 'k6.json').write_text(json.dumps(summary, indent=2) + '\n')
    (output / 'metadata.json').write_text(json.dumps(meta, indent=2) + '\n')
