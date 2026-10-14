#!/usr/bin/env python3
"""Record Pod/HPA/resource evidence; no env/config/Secret values are queried."""
import argparse
import datetime
import json
import os
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--seconds', type=int, default=480)
parser.add_argument('--interval', type=int, default=15)
parser.add_argument('--output', default='/tmp/avengers-k8s-load-results/hpa-final.jsonl')
args = parser.parse_args()
context = os.getenv('K8S_CONTEXT', 'docker-desktop')
if context != 'docker-desktop' and os.getenv('K8S_ALLOW_OTHER_CONTEXT') != '1':
    raise SystemExit('Refusing non-Docker-Desktop context')
path = Path(args.output)
path.parent.mkdir(parents=True, exist_ok=True)
deadline = time.monotonic() + args.seconds
with path.open('w') as stream:
    while time.monotonic() < deadline:
        record = {'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        for resource in ['hpa', 'deployments', 'pods']:
            result = subprocess.run(['kubectl', '--context', context, '--request-timeout=10s',
                                     '-n', 'avengers-coffee', 'get', resource, '-o', 'json'],
                                    capture_output=True, text=True)
            if result.returncode:
                record[resource + '_error'] = result.returncode
                continue
            objects = json.loads(result.stdout)['items']
            if resource == 'hpa':
                record[resource] = [{'name': o['metadata']['name'], **o.get('status', {})} for o in objects]
            elif resource == 'deployments':
                record[resource] = [{'name': o['metadata']['name'], 'replicas': o['spec']['replicas'],
                                    'ready': o.get('status', {}).get('readyReplicas', 0)} for o in objects]
            else:
                record[resource] = [{'name': o['metadata']['name'], 'phase': o['status']['phase'],
                                    'restarts': sum(c.get('restartCount', 0) for c in o['status'].get('containerStatuses', []))}
                                   for o in objects]
        for label, command in [('nodes', ['top', 'nodes']), ('pods', ['-n', 'avengers-coffee', 'top', 'pods'])]:
            result = subprocess.run(['kubectl', '--context', context, '--request-timeout=10s', *command],
                                    capture_output=True, text=True)
            record['top_' + label] = result.stdout
        stream.write(json.dumps(record) + '\n')
        stream.flush()
        time.sleep(min(args.interval, max(0, deadline - time.monotonic())))
print('Recorded HPA/resource evidence:', path)
