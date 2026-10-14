#!/usr/bin/env python3
"""Bounded, independent read-only capacity run with sanitized, sampled evidence."""
import argparse
import hashlib
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
import os
import resource
from pathlib import Path
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
APPS = {'web-customer': 1, 'api-gateway': 2, 'identity-service': 1, 'menu-service': 1,
        'inventory-service': 1, 'order-service': 1, 'news-service': 1, 'ai-service': 1}
HPA = {'api-gateway': 2, 'identity-service': 1, 'menu-service': 1}
K = ['kubectl', '--context', 'docker-desktop', '--request-timeout=10s']


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def command(args):
    try:
        p = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=25)
        return p.returncode, p.stdout
    except (subprocess.TimeoutExpired, OSError):
        return 124, ''


def get(resource, namespaced=True):
    code, out = command(K + (['-n', 'avengers-coffee'] if namespaced else []) + ['get', resource, '-o', 'json'])
    return json.loads(out)['items'] if code == 0 else None


def compose_overlap():
    code, names = command(['docker', 'compose', 'ps', '--status', 'running', '--services'])
    return code, sorted(set(names.splitlines()) & set(APPS))


def snapshot():
    # Never persist raw Pod specs, env, ConfigMaps, Secrets, or application logs.
    tasks = {'pods': lambda: get('pods'), 'hpa': lambda: get('hpa'),
             'deployments': lambda: get('deployments'), 'nodes': lambda: get('nodes', False),
             'events': lambda: get('events'),
             'top_nodes': lambda: command(K + ['top', 'nodes']),
             'top_pods': lambda: command(K + ['-n', 'avengers-coffee', 'top', 'pods'])}
    with ThreadPoolExecutor(max_workers=7) as pool:
        futures = {key: pool.submit(fn) for key, fn in tasks.items()}
        raw = {key: future.result() for key, future in futures.items()}
    r = {'observed_at': now()}
    code, overlap = compose_overlap()
    r['compose_application_overlap'] = overlap
    if code:
        r['compose_state_error'] = code
    for key in ['pods', 'hpa', 'deployments', 'nodes', 'events']:
        if raw[key] is None:
            r[key + '_error'] = True
    r['pods'] = []
    for o in raw['pods'] or []:
        statuses = []
        for c in o['status'].get('containerStatuses', []) + o['status'].get('initContainerStatuses', []):
            def state(value):
                return {k: {x: v[x] for x in ['reason', 'exitCode', 'startedAt', 'finishedAt'] if x in v}
                        for k, v in value.items()}
            statuses.append({'name': c['name'], 'ready': c.get('ready', False),
                             'restartCount': c.get('restartCount', 0), 'state': state(c.get('state', {})),
                             'lastState': state(c.get('lastState', {})), 'imageID': c.get('imageID')})
        r['pods'].append({'name': o['metadata']['name'], 'uid': o['metadata']['uid'],
                          'app': o['metadata'].get('labels', {}).get('app.kubernetes.io/name'),
                          'phase': o['status']['phase'], 'deleting': bool(o['metadata'].get('deletionTimestamp')),
                          'conditions': o['status'].get('conditions', []), 'containers': statuses})
    r['hpa'] = [{'name': o['metadata']['name'], 'min': o['spec']['minReplicas'],
                 'max': o['spec']['maxReplicas'], **o.get('status', {})} for o in raw['hpa'] or []]
    r['deployments'] = [{'name': o['metadata']['name'], 'replicas': o['spec']['replicas'],
                         'ready': o.get('status', {}).get('readyReplicas', 0),
                         'containers': [{**{k: c[k] for k in ['name', 'image', 'resources', 'livenessProbe',
                                        'readinessProbe'] if k in c}, 'capacity_flags': {
                                            e['name']: e.get('value') for e in c.get('env', [])
                                            if e['name'] in ['GATEWAY_REQUEST_LOGGING', 'GATEWAY_PROXY_KEEP_ALIVE',
                                                             'GATEWAY_MAX_REQUESTS_PER_SOCKET']}}
                                        for c in o['spec']['template']['spec']['containers']]}
                        for o in raw['deployments'] or []]
    r['nodes'] = [{'name': o['metadata']['name'], 'capacity': o['status']['capacity'],
                   'allocatable': o['status']['allocatable'], 'conditions': o['status']['conditions']}
                  for o in raw['nodes'] or []]
    r['events'] = [{'uid': o['metadata']['uid'], 'reason': o.get('reason'), 'type': o.get('type'),
                    'object': o.get('involvedObject', {}).get('name'), 'count': o.get('count', 1),
                    'lastTimestamp': o.get('lastTimestamp'),
                    'message': o.get('message', '') if o.get('reason') in
                    ['Unhealthy', 'Killing', 'BackOff', 'FailedScheduling', 'Evicted'] else ''}
                   for o in raw['events'] or []]
    for key in ['top_nodes', 'top_pods']:
        code, out = raw[key]
        r[key] = out
        if code:
            r[key + '_error'] = code
    return r


def recovered(r):
    if any(k.endswith('_error') for k in r):
        return False
    if r.get('compose_application_overlap'):
        return False
    ds = {d['name']: d for d in r['deployments']}
    if set(ds) != set(APPS) or any(ds[n]['replicas'] != v or ds[n]['ready'] != v for n, v in APPS.items()):
        return False
    if len(r['hpa']) != 3 or any(h.get('currentReplicas') != HPA.get(h['name']) or
                                h.get('desiredReplicas') != HPA.get(h['name']) or not metrics_valid(h)
                                for h in r['hpa']):
        return False
    if not r['nodes'] or any(c['status'] != ('True' if c['type'] == 'Ready' else 'False')
                             for n in r['nodes'] for c in n['conditions']
                             if c['type'] in ['Ready', 'MemoryPressure', 'DiskPressure', 'PIDPressure']):
        return False
    return all(p['phase'] == 'Running' and not p['deleting'] and
               all(c['ready'] for c in p['containers'] if c['name'] != 'public-media') for p in r['pods'])


def metrics_valid(h):
    return any(c.get('type') == 'ScalingActive' and c.get('status') == 'True'
               for c in h.get('conditions', [])) and any(
                   m.get('resource', {}).get('name') == 'cpu' and
                   m.get('resource', {}).get('current', {}).get('averageUtilization') is not None
                   for m in h.get('currentMetrics', []))


def wait_recovery(stream, timeout):
    deadline = time.monotonic() + timeout
    streak = 0
    last_state = None
    while time.monotonic() < deadline:
        r = snapshot()
        stream.write(json.dumps(r) + '\n'); stream.flush()
        streak = streak + 1 if recovered(r) else 0
        if streak >= 2:
            return r
        state = [(h['name'], h.get('currentReplicas'), h.get('desiredReplicas')) for h in r['hpa']]
        if state != last_state:
            print('Natural cooldown (current/desired): ' + str(state), flush=True)
            last_state = state
        time.sleep(15)
    raise RuntimeError('Cooldown timed out; refusing another load. Evidence retained.')


def violations(before, samples):
    reasons = set()
    counts = {(p['uid'], c['name']): c['restartCount'] for p in before['pods'] for c in p['containers']}
    events = {e['uid']: e['count'] for e in before['events']}
    for r in samples:
        if any(k.endswith('_error') for k in r):
            reasons.add('observer data unavailable')
        if r.get('compose_application_overlap'):
            reasons.add('duplicate Compose application detected')
        for p in r['pods']:
            for c in p['containers']:
                if c['restartCount'] > counts.get((p['uid'], c['name']), 0):
                    reasons.add('new application container restart')
                if c['state'].get('waiting', {}).get('reason') == 'CrashLoopBackOff':
                    reasons.add('CrashLoopBackOff')
                if c['lastState'].get('terminated', {}).get('reason') == 'OOMKilled' and c['restartCount'] > counts.get((p['uid'], c['name']), 0):
                    reasons.add('new OOMKilled')
                if c['state'].get('terminated', {}).get('reason') == 'OOMKilled':
                    reasons.add('new OOMKilled')
        for n in r['nodes']:
            if any(c['type'] in ['MemoryPressure', 'DiskPressure', 'PIDPressure'] and c['status'] == 'True' for c in n['conditions']):
                reasons.add('node pressure')
        for e in r['events']:
            overload_kill = e['reason'] == 'Killing' and 'liveness' in e['message'].lower()
            if e['count'] > events.get(e['uid'], 0) and (overload_kill or e['reason'] in ['BackOff', 'Evicted']):
                reasons.add('new ' + e['reason'] + ' event')
        if len(r['hpa']) != 3 or any(not metrics_valid(h) for h in r['hpa']):
            reasons.add('HPA metrics invalid')
    return sorted(reasons)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('vus', type=int)
    parser.add_argument('--label', default='baseline')
    parser.add_argument('--cooldown-timeout', type=int, default=720)
    args = parser.parse_args()
    if os.getenv('K8S_DB_MODE') != 'existing' or not 1 <= args.vus <= 5000:
        parser.error('existing DB mode and 1..5000 VUs are required')
    if not args.label.replace('-', '').replace('_', '').isalnum():
        parser.error('label must be alphanumeric with - or _')
    destination = Path(os.getenv('K8S_CAPACITY_RESULTS', '/tmp/avengers-k8s-capacity'))
    folder = destination / f'{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%S.%fZ}-{args.label}-{args.vus}'
    folder.mkdir(parents=True)
    print('Evidence:', folder, flush=True)
    binary = os.getenv('K6_BIN', str(ROOT / '.tools/k6/0.57.0/k6'))
    code, version = command([binary, 'version'])
    if code:
        raise RuntimeError('Native k6 missing')
    code, overlap = compose_overlap()
    if code or overlap:
        raise RuntimeError('Stop duplicate customer Compose applications before capacity qualification')
    # Only inspect the two public demo policies; no other configuration values.
    code, flags = command(K + ['-n', 'avengers-coffee', 'get', 'configmap', 'avengers-common',
                              '-o', 'jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}'])
    if code or flags.strip() != 'true 5000':
        raise RuntimeError('Requires read-only mode and unchanged 5s cache')
    env = os.environ.copy()
    env.update(CAPACITY_VUS=str(args.vus), THINK_SECONDS='3', BASE_URL='http://localhost:3000', SUMMARY_FILE=str(folder / 'k6.json'))
    env['WEB_URL'] = 'http://localhost:5175'
    meta = {'started_at': now(), 'vus': args.vus, 'think_seconds': 3, 'cache_ms': 5000,
            'accept_encoding': env.get('CAPACITY_ACCEPT_ENCODING') or 'legacy identity (header absent)',
            'ramp_seconds': int(env.get('CAPACITY_RAMP_SECONDS', 60)),
            'hold_seconds': int(env.get('CAPACITY_HOLD_SECONDS', 120)), 'down_seconds': 30,
            'k6_version': version.strip(), 'source_head': command(['git', 'rev-parse', 'HEAD'])[1].strip(),
            'generator_rlimit_nofile': resource.getrlimit(resource.RLIMIT_NOFILE),
            'host_fd_limit': command(['launchctl', 'limit', 'maxfiles'])[1].strip(),
            'host_cpu_count': command(['sysctl', '-n', 'hw.ncpu'])[1].strip()}
    meta['workload_sha256'] = hashlib.sha256((ROOT / 'load-tests/k6/customer-browse-capacity.js').read_bytes()).hexdigest()
    if Path(binary).is_file():
        meta['k6_sha256'] = hashlib.sha256(Path(binary).read_bytes()).hexdigest()
    (folder / 'metadata.json').write_text(json.dumps(meta, indent=2))
    with (folder / 'pre-cooldown.jsonl').open('w') as stream:
        before = wait_recovery(stream, args.cooldown_timeout)
    (folder / 'before.json').write_text(json.dumps(before, indent=2))
    meta['gateway_policy'] = next(d['containers'][0].get('capacity_flags', {})
                                  for d in before['deployments'] if d['name'] == 'api-gateway')
    code, runtime = command(K + ['-n', 'avengers-coffee', 'exec', 'deployment/api-gateway', '--', 'node', '-e',
                                'console.log(JSON.stringify({node:process.version,arch:process.arch}))'])
    if not code:
        meta['gateway_runtime'] = json.loads(runtime)
    with (folder / 'smoke-before.txt').open('w') as log:
        if subprocess.run(['bash', 'scripts/k8s/smoke.sh'], cwd=ROOT, env=env, stdout=log, stderr=log).returncode:
            (folder / 'result.json').write_text(json.dumps({'status': 'ABORTED before load',
                'http_pass': False, 'stable': False, 'reason': 'pre-load smoke failed'}, indent=2))
            meta['finished_at'] = now()
            (folder / 'metadata.json').write_text(json.dumps(meta, indent=2))
            raise RuntimeError('Pre-load smoke failed; no load sent')
    stop = threading.Event()
    samples = []
    pid = [None]
    phase = ['preload']
    interrupted = [False]

    def observe():
        with (folder / 'observer.jsonl').open('w') as stream:
            while not stop.is_set():
                r = snapshot()
                code, host = command(['top', '-l', '1', '-n', '0'])
                r['host'] = '\n'.join(line for line in host.splitlines() if line.startswith(('CPU usage:', 'PhysMem:', 'Load Avg:', 'VM:')))
                code, processes = command(['ps', '-axww', '-o', 'pid=,pcpu=,rss=,comm='])
                process_rows = []
                if not code:
                    for line in processes.splitlines():
                        v = line.split(None, 3)
                        if len(v) == 4:
                            process_rows.append({'pid': int(v[0]), 'cpu': float(v[1]), 'rss_KiB': int(v[2]),
                                                 'name': Path(v[3]).name})
                    r['host_processes_by_cpu'] = sorted(process_rows, key=lambda p: p['cpu'], reverse=True)[:10]
                if pid[0]:
                    code, usage = command(['ps', '-p', str(pid[0]), '-o', '%cpu=,rss=,time='])
                    r['k6_process'] = usage.strip()
                    # Count descriptors only; never persist socket peers or file paths.
                    code, descriptors = command(['lsof', '-nP', '-p', str(pid[0]), '-F', 'f'])
                    if not code:
                        r['k6_open_fds'] = sum(1 for line in descriptors.splitlines() if line.startswith('f') and line[1:].isdigit())
                r['phase'] = phase[0]
                # Numeric cgroup counters show CPU quota pressure without app logs/env.
                r['gateway_cgroups'] = {}
                for p in r['pods']:
                    if p['app'] != 'api-gateway' or p['phase'] != 'Running' or p['deleting']:
                        continue
                    code, counters = command(K + ['-n', 'avengers-coffee', 'exec', p['name'], '--',
                                                   'cat', '/sys/fs/cgroup/cpu.stat', '/sys/fs/cgroup/memory.events'])
                    if not code:
                        r['gateway_cgroups'][p['uid']] = dict(line.split() for line in counters.splitlines() if len(line.split()) == 2)
                samples.append(r)
                stream.write(json.dumps(r) + '\n'); stream.flush()
                if r.get('compose_application_overlap') and pid[0] and not interrupted[0]:
                    # Stop only this harness's generator, never external workloads.
                    try:
                        os.kill(pid[0], 2)
                    except ProcessLookupError:
                        pass
                    interrupted[0] = True
                    print('Stopping load: duplicate Compose application appeared. Evidence retained.', flush=True)
                stop.wait(10)

    observer = threading.Thread(target=observe)
    observer.start()
    try:
        time.sleep(2)
        with (folder / 'k6.log').open('w') as log:
            process = subprocess.Popen([binary, 'run', 'load-tests/k6/customer-browse-capacity.js'], cwd=ROOT, env=env, stdout=log, stderr=log)
            pid[0] = process.pid
            phase[0] = 'load'
            meta['load_started_at'] = now()
            print(f'Running independent {args.vus} VUs: 60s ramp / 120s hold / 30s down...', flush=True)
            try:
                code = process.wait(timeout=meta['ramp_seconds'] + meta['hold_seconds'] + 90)
            except BaseException:
                process.terminate(); process.wait(timeout=20)
                raise
            meta['k6_exit'] = code
            meta['load_finished_at'] = now()
            pid[0] = None
            phase[0] = 'cooldown'
        print('Load complete; recording natural recovery...', flush=True)
        with (folder / 'post-cooldown.jsonl').open('w') as stream:
            after = wait_recovery(stream, args.cooldown_timeout)
        (folder / 'after.json').write_text(json.dumps(after, indent=2))
        with (folder / 'smoke-after.txt').open('w') as log:
            smoke = subprocess.run(['bash', 'scripts/k8s/smoke.sh'], cwd=ROOT, env=env, stdout=log, stderr=log).returncode
        issues = violations(before, samples + [after])
        data = json.loads((folder / 'k6.json').read_text()) if (folder / 'k6.json').exists() else {'metrics': {}}
        if interrupted[0]:
            issues.append('generator stopped due to duplicate Compose application')
        http_pass = code == 0 and bool(data['metrics']) and all(t['ok'] for m in data['metrics'].values() for t in m.get('thresholds', {}).values())
        if smoke:
            issues.append('post-load smoke failed')
        result = {'http_pass': http_pass, 'stable': not issues, 'violations': issues,
                  'status': 'STABLE PASS' if http_pass and not issues else 'UNSTABLE' if http_pass else 'FAIL',
                  'smoke_after_exit': smoke}
        (folder / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)
    finally:
        stop.set(); observer.join(timeout=30)
        meta['finished_at'] = now()
        (folder / 'metadata.json').write_text(json.dumps(meta, indent=2))
    return 0 if result['status'] == 'STABLE PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
