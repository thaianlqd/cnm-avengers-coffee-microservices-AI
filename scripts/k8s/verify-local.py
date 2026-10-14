#!/usr/bin/env python3
"""Temporary image smoke on Compose network; explicitly not a Kubernetes test."""
import json
import subprocess
import time
import uuid
import urllib.request
import urllib.error
from environment import compose, SERVICES, run


def request(base, path, expected=200):
    try:
        with urllib.request.urlopen(base + path, timeout=15) as response:
            code = response.status
            data = response.read()
    except urllib.error.HTTPError as error:
        code, data = error.code, b''
    if code != expected:
        raise ValueError(f'HTTP {path}: expected {expected}, received {code}')
    print(f'PASS HTTP {path}: {code}', flush=True)
    return data


def main():
    services, _ = compose()
    for name in ['web-customer', *SERVICES]:
        info = json.loads(run(['docker', 'image', 'inspect', f'avengers/{name}:k8s-local']))[0]
        if info['Architecture'] != 'arm64':
            raise ValueError(f'Image {name} must be arm64')
        print(f'PASS image {name}: arm64 {info["Id"][:19]}', flush=True)
    gateway_id = run(['docker', 'compose', 'ps', '-q', 'api-gateway']).strip()
    if not gateway_id:
        raise ValueError('Existing Compose gateway must be running for this additional local proxy smoke')
    network = next(iter(json.loads(run(['docker', 'inspect', gateway_id]))[0]['NetworkSettings']['Networks']))
    names = []
    try:
        for name, port in [('web-customer', 80), ('api-gateway', 3000)]:
            container = 'avengers-k8s-verify-' + uuid.uuid4().hex[:8]
            command = ['docker', 'run', '--rm', '-d', '--name', container,
                       '-p', f'127.0.0.1::{port}']
            if name == 'api-gateway':
                command += ['--network', network]
                for key, value in services[name]['environment'].items():
                    if key.endswith('_SERVICE_URL'):
                        command += ['-e', f'{key}={value}']
            run(command + [f'avengers/{name}:k8s-local'])
            names.append(container)
            info = json.loads(run(['docker', 'inspect', container]))[0]
            host_port = info['NetworkSettings']['Ports'][f'{port}/tcp'][0]['HostPort']
            base = 'http://127.0.0.1:' + host_port
            # Wait on startup, not a fixed assumption that the image is immediately ready.
            for attempt in range(30):
                try:
                    with urllib.request.urlopen(base + '/health/live', timeout=2):
                        break
                except (OSError, urllib.error.URLError):
                    if attempt == 29:
                        raise ValueError(f'{name} did not become live') from None
                    time.sleep(1)
            request(base, '/health/live')
            request(base, '/health/ready')
            if name == 'web-customer':
                if b'<html' not in request(base, '/'):
                    raise ValueError('Expected Nginx production HTML')
                request(base, '/menu')  # React SPA fallback.
            else:
                for path in ['/menu/danh-muc', '/menu/san-pham', '/users/branches/public', '/news?page=1&limit=6']:
                    request(base, path)
                request(base, '/users/me', expected=401)
        print('PASS isolated Web/Gateway image smoke using existing Compose backends; Kubernetes is NOT RUN', flush=True)
    finally:
        for name in names:
            # These UUID-named test containers alone are owned by this helper.
            subprocess.run(['docker', 'stop', '--time', '5', name], capture_output=True, text=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('FAIL local image smoke:', str(error) if isinstance(error, ValueError) else 'network/tool failure (details redacted)', flush=True)
        raise SystemExit(1)
