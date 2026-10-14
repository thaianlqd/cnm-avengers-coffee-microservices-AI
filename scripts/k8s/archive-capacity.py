#!/usr/bin/env python3
"""Archive only the capacity harness's sanitized evidence, never arbitrary files."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('summary', Path(__file__).with_name('summarize-capacity.py'))
summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(summary)


def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/avengers-k8s-capacity')
    destination = ROOT / 'k8s/verification/capacity'
    destination.mkdir(parents=True, exist_ok=True)
    index = []
    for folder in sorted(source.iterdir()):
        if not (folder / 'metadata.json').exists():
            continue
        result = summary.summarize(folder)
        target = destination / folder.name
        target.mkdir(exist_ok=True)
        for name in ['metadata.json', 'result.json', 'aborted.json', 'qualification-exclusion.json', 'analysis.json', 'before.json',
                     'after.json', 'k6.json', 'smoke-before.txt', 'smoke-after.txt']:
            if (folder / name).exists():
                shutil.copyfile(folder / name, target / name)
        for name in ['observer.jsonl', 'pre-cooldown.jsonl', 'post-cooldown.jsonl', 'k6.log']:
            if (folder / name).exists():
                (target / (name + '.gz')).write_bytes(gzip.compress((folder / name).read_bytes(), mtime=0))
        index.append({key: result.get(key) for key in ['directory', 'vus', 'status', 'accept_encoding',
                     'gateway_policy', 'http_pass', 'stable', 'requests', 'rps', 'successful_rps',
                     'failure_rate', 'checks_rate', 'p95_ms', 'hold_metrics', 'hold_rps', 'hpa_peak', 'new_restarts']})
    (destination / 'index.json').write_text(json.dumps(index, indent=2) + '\n')
    for name in ['encoding-diagnostic.json', 'public-encoding.json']:
        if (source / name).exists():
            shutil.copyfile(source / name, destination / name)
    regression = destination / 'regression'
    regression.mkdir(exist_ok=True)
    for name in ['checks.json', 'moderate.json', 'moderate-before.json', 'moderate-after.json',
                 'moderate-analysis.json', 'final-state.json', 'healing.txt', 'rollout.txt',
                 'moderate-smoke-before.txt', 'moderate-smoke-after.txt', 'smoke-final.txt',
                 'deploy-final.txt', 'final-search.json', 'final-search-plan.py',
                 'healing-samples.txt', 'rollout-samples.txt', 'availability-plan.py']:
        if (source / 'regression' / name).exists():
            shutil.copyfile(source / 'regression' / name, regression / name)
    for name in ['moderate-observer.jsonl', 'moderate-pre-cooldown.jsonl',
                 'moderate-post-cooldown.jsonl', 'moderate.log', 'final-search.log',
                 'availability-pre-cooldown.jsonl', 'availability-post-cooldown.jsonl']:
        path = source / 'regression' / name
        if path.exists():
            (regression / (name + '.gz')).write_bytes(gzip.compress(path.read_bytes(), mtime=0))
    original = Path('/tmp/avengers-k8s-load-results')
    if (original / 'k6-1k-to-5k.json').exists():
        target = destination / 'original-staircase'
        target.mkdir(exist_ok=True)
        shutil.copyfile(original / 'k6-1k-to-5k.json', target / 'k6.json')
        path = original / 'hpa-1k-to-5k.jsonl'
        if path.exists():
            (target / 'observer.jsonl.gz').write_bytes(gzip.compress(path.read_bytes(), mtime=0))
    checksums = {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in sorted(destination.rglob('*')) if p.is_file() and p.name != 'sha256.json'}
    (destination / 'sha256.json').write_text(json.dumps(checksums, indent=2) + '\n')
    print(f'Archived {len(index)} attempts; sanitized files only: {destination}')


if __name__ == '__main__':
    main()
