#!/usr/bin/env python3
"""Keep sufficient numeric points for exact merge; store large original outside Git."""
import gzip
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path


def archive(folder, raw_archive):
    raw = folder / 'http-points.jsonl.gz'
    compact = folder / 'metric-points.jsonl.gz'
    counts = Counter()
    raw_sha = hashlib.sha256(raw.read_bytes()).hexdigest()
    with gzip.open(raw, 'rt') as source, gzip.open(compact, 'wt', compresslevel=9) as destination:
        for line in source:
            row = json.loads(line)
            if row.get('type') != 'Point':
                continue
            metric = row['metric']
            if metric not in ('http_reqs', 'response_statuses', 'checks', 'http_req_failed', 'http_req_duration') and not metric.endswith('_ms') and not metric.startswith(('http_req_connecting', 'http_req_waiting', 'http_req_receiving', 'http_req_blocked', 'http_req_tls')):
                continue
            point = row['data']
            tags = point.get('tags') or {}
            destination.write(json.dumps([metric, point['value'], tags.get('phase'), tags.get('status'), tags.get('name')], separators=(',', ':')) + '\n')
            counts[metric] += 1
    manifest = {'original_raw_sha256': raw_sha, 'original_raw_bytes': raw.stat().st_size, 'compact_sha256': hashlib.sha256(compact.read_bytes()).hexdigest(), 'compact_bytes': compact.stat().st_size, 'format': '[metric,value,phase,status,route_name]; exact numeric observations, no response bodies', 'metric_observation_counts': dict(counts)}
    (folder / 'metric-points-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    raw_archive.mkdir(parents=True, exist_ok=True)
    target = raw_archive / (raw_sha + '.jsonl.gz')
    if target.exists():
        raise ValueError('raw archive already exists')
    raw.rename(target)
    return manifest


if __name__ == '__main__':
    print(json.dumps(archive(Path(sys.argv[1]), Path(sys.argv[2])), indent=2))
