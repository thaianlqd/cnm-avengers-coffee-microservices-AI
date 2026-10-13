#!/usr/bin/env python3
"""Resolve Compose configuration in memory; never emit secrets or source shell .env."""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[2]
NAMESPACE = 'avengers-coffee'
SERVICES = {'api-gateway': 3000, 'identity-service': 3001, 'menu-service': 3003,
            'inventory-service': 3004, 'order-service': 3005, 'news-service': 3006, 'ai-service': 8000}
REQUIRED = ('JWT_SECRET', 'INTERNAL_SERVICE_TOKEN', 'VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET')
SENSITIVE = re.compile(r'PASSWORD|SECRET|TOKEN|API_KEY|SMTP_USER|SMTP_PASS|ACCOUNT_NO|TMN_CODE|FACEBOOK_APP_ID|RABBITMQ_URL')


def run(args, **kwargs):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, **kwargs)
    if result.returncode:
        # Third-party error messages can contain credentials; do not forward them.
        raise ValueError(f'{args[0]} operation failed (exit {result.returncode}); check configuration locally')
    return result.stdout


def compose():
    if not (ROOT / '.env').is_file():
        raise ValueError('Root .env is required; copy .env.example and fill it locally')
    args = ['docker', 'compose', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'docker-compose.yml'), 'config']
    values = dict(line.split('=', 1) for line in run(args + ['--environment']).splitlines() if '=' in line)
    missing = [key for key in REQUIRED if not values.get(key, '').strip()]
    if missing:
        raise ValueError('Missing required environment variables: ' + ', '.join(missing))
    config = json.loads(run(args + ['--format', 'json']))
    return config['services'], values


def published(service, target):
    ports = [p for p in service.get('ports', []) if int(p['target']) == target]
    if len(ports) != 1:
        raise ValueError(f'Expected exactly one Compose published port for target {target}')
    return str(ports[0]['published'])


def build_objects(services, values):
    host = os.getenv('K8S_INFRA_HOST', 'host.docker.internal')
    mode = os.getenv('K8S_DB_MODE', 'compose')
    if mode not in ('compose', 'existing'):
        raise ValueError('K8S_DB_MODE must be compose or existing')
    pg = services['postgres-db']['environment']
    if mode == 'compose' and not values.get('POSTGRES_PASSWORD', '').strip():
        raise ValueError('Set POSTGRES_PASSWORD explicitly in root .env for Compose DB mode; no fallback password is copied')
    result = []
    for name, port in SERVICES.items():
        config, secrets = {}, {}
        for key, value in services[name].get('environment', {}).items():
            value = '' if value is None else str(value)
            if SENSITIVE.search(key):
                # Drop token-like Compose fallback values absent from explicit local environment.
                if key in values and values[key]:
                    secrets[key] = values[key]
            else:
                config[key] = value
        if name != 'api-gateway':
            local_db = config.get('DB_HOST') in ('postgres-db', 'localhost', '127.0.0.1', 'host.docker.internal')
            if mode == 'compose':
                config.update(DB_HOST=host, DB_PORT=published(services['postgres-db'], 5432),
                              DB_USER=str(pg['POSTGRES_USER']), DB_NAME=str(pg['POSTGRES_DB']), PGSSLMODE='disable')
                secrets['DB_PASSWORD'] = values['POSTGRES_PASSWORD']
            elif local_db:
                config.update(DB_HOST=host, DB_PORT=published(services['postgres-db'], 5432))
            if not secrets.get('DB_PASSWORD'):
                raise ValueError(f'{name}: explicit DB_PASSWORD required in existing DB mode')
        config.update(PORT=str(port), NODE_ENV='production')
        for backend, target in SERVICES.items():
            if backend != 'api-gateway':
                config[backend.replace('-service', '').replace('-', '_').upper() + '_SERVICE_URL'] = f'http://{backend}:{target}'
        config.update(WEB_CUSTOMER_BASE_URL='http://localhost:5175', PAYMENT_RETURN_BASE_URL='http://localhost:3000')
        if name in ('order-service', 'ai-service'):
            config.update(REDIS_HOST=host, REDIS_PORT=published(services['redis-cache'], 6379))
        if name == 'order-service':
            config['SOCKET_REDIS_ENABLED'] = 'true'
            url = urlsplit(values.get('RABBITMQ_URL', 'amqp://rabbitmq:5672'))
            if url.hostname in ('rabbitmq', 'localhost', '127.0.0.1', 'host.docker.internal'):
                auth = url.netloc.rsplit('@', 1)[0] + '@' if '@' in url.netloc else ''
                url = url._replace(netloc=auth + host + ':' + published(services['rabbitmq'], 5672))
            secrets['RABBITMQ_URL'] = urlunsplit(url)
        metadata = {'namespace': NAMESPACE, 'labels': {'app.kubernetes.io/name': name,
                    'app.kubernetes.io/component': 'configuration', 'app.kubernetes.io/part-of': 'avengers-coffee'}}
        result += [dict(apiVersion='v1', kind='ConfigMap', metadata=dict(metadata, name=name + '-config'), data=config),
                   dict(apiVersion='v1', kind='Secret', metadata=dict(metadata, name=name + '-secrets'),
                        type='Opaque', stringData=secrets)]
    return result


def frontend_args(values):
    keys = {'VITE_API_URL': 'http://localhost:3000', 'VITE_SOCKET_URL': 'http://localhost:3005'}
    for key, source in {'VITE_GOOGLE_CLIENT_ID': 'WEB_CUSTOMER_GOOGLE_CLIENT_ID',
                        'VITE_RECAPTCHA_SITE_KEY': 'WEB_CUSTOMER_RECAPTCHA_SITE_KEY',
                        'VITE_FACEBOOK_APP_ID': 'WEB_CUSTOMER_FACEBOOK_APP_ID',
                        'VITE_MAPBOX_ACCESS_TOKEN': 'VITE_MAPBOX_ACCESS_TOKEN',
                        'VITE_VIETMAP_API_KEY': 'VITE_VIETMAP_API_KEY',
                        'VITE_VIETMAP_TILE_KEY': 'VITE_VIETMAP_TILE_KEY'}.items():
        keys[key] = values.get(source, '')
    return keys


def build_media():
    directories = {'menu_media': ROOT / 'avengers-coffee-system/apps/web-customer/public/images/products',
                   'news_media': ROOT / 'avengers-coffee-system/shared/uploads'}
    digest = hashlib.sha256((ROOT / 'k8s/media/Dockerfile').read_bytes())
    for name, directory in directories.items():
        if not directory.is_dir():
            raise ValueError('Public media directory missing: ' + name)
        for file in sorted(directory.rglob('*')):
            if file.is_symlink():
                raise ValueError('Media snapshot refuses symlinks outside the public asset directory')
            if file.is_file():
                digest.update((name + str(file.relative_to(directory))).encode())
                digest.update(file.read_bytes())
    fingerprint = digest.hexdigest()
    tag = 'avengers/customer-media:k8s-local'
    current = subprocess.run(['docker', 'image', 'inspect', tag, '--format',
                              '{{index .Config.Labels "avengers-coffee.media-fingerprint"}}'],
                             text=True, capture_output=True)
    if current.returncode == 0 and current.stdout.strip() == fingerprint:
        print('Public media image unchanged; using existing arm64 snapshot')
        return
    command = ['docker', 'build', '--platform=linux/arm64', '--label',
               'avengers-coffee.media-fingerprint=' + fingerprint, '-t', tag]
    for name, directory in directories.items():
        command += ['--build-context', name + '=' + str(directory)]
    subprocess.run(command + [str(ROOT / 'k8s/media')], check=True)


def prepare_overlay(objects=None):
    folder = ROOT / 'k8s/overlays/.docker-desktop-runtime'
    folder.mkdir(parents=True, exist_ok=True)
    patches = []
    if objects is not None:
        def immutable_image(name):
            source = f'avengers/{name}:k8s-local'
            image_id = run(['docker', 'image', 'inspect', source, '--format', '{{.Id}}']).strip()
            target = f'avengers/{name}:k8s-local-' + image_id.split(':')[-1][:12]
            run(['docker', 'tag', source, target])
            return image_id, target
        media_id, media_tag = immutable_image('customer-media')
        for name in ['web-customer', *SERVICES]:
            effective = [obj for obj in objects if obj['metadata']['name'].startswith(name + '-')]
            common_file = ROOT / 'k8s/base/configmap.yaml'
            shared = common_file.read_bytes() if common_file.is_file() else b''
            revision = hashlib.sha256(shared + json.dumps(effective, sort_keys=True).encode()).hexdigest()
            image_id, image_tag = immutable_image(name)
            if name in ('menu-service', 'news-service'):
                image_id += ':' + media_id
            containers = [{'name': name, 'image': image_tag}]
            spec = {'containers': containers}
            if name in ('menu-service', 'news-service'):
                spec['initContainers'] = [{'name': 'public-media', 'image': media_tag}]
            patches.append({'target': {'kind': 'Deployment', 'name': name}, 'patch': json.dumps({
                'apiVersion': 'apps/v1', 'kind': 'Deployment', 'metadata': {'name': name},
                'spec': {'template': {'metadata': {'annotations': {
                    'avengers-coffee/config-revision': revision,
                    'avengers-coffee/local-image-id': image_id}}, 'spec': spec}}})})
    (folder / 'kustomization.yaml').write_text(json.dumps({'apiVersion': 'kustomize.config.k8s.io/v1beta1',
        'kind': 'Kustomization', 'resources': ['../docker-desktop'], 'patches': patches}, indent=2) + '\n')
    return folder


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'apply', 'build', 'media', 'prepare', 'prepare-configured', 'ports', 'audit'])
    args = parser.parse_args()
    if args.action == 'prepare':
        print(prepare_overlay())
        return
    if args.action == 'media':
        build_media()
        return
    services, values = compose()
    if args.action == 'build':
        build_media()
        for name in ['web-customer', *SERVICES]:
            path = ROOT / ('avengers-coffee-system/apps/web-customer' if name == 'web-customer' else
                           'avengers-coffee-system/api-gateway/gateway-root' if name == 'api-gateway' else
                           'avengers-coffee-system/services/' + name)
            command = ['docker', 'build', '--platform=linux/arm64', '-t', f'avengers/{name}:k8s-local']
            if name != 'ai-service':
                command += ['--target', 'runner']
            # Pass public build arguments by name via subprocess env; keep values off argv/logs.
            env = os.environ.copy()
            if name == 'web-customer':
                for key, value in frontend_args(values).items():
                    env[key] = value
                    command += ['--build-arg', key]
            print(f'Building {name} (native arm64)', flush=True)
            subprocess.run(command + [str(path)], cwd=ROOT, env=env, check=True)
        return
    objects = build_objects(services, values)
    if args.action == 'prepare-configured':
        print(prepare_overlay(objects))
    elif args.action == 'audit':
        order = {}
        for obj in objects:
            if obj['metadata']['name'].startswith('order-service-'):
                order.update(obj.get('data', obj.get('stringData', {})))
        javascript = '''
const {Client}=require('pg'),fs=require('fs'); const e=JSON.parse(fs.readFileSync(0,'utf8'));
const c=new Client({host:e.DB_HOST,port:Number(e.DB_PORT),user:e.DB_USER,password:e.DB_PASSWORD,
 database:e.DB_NAME,ssl:e.PGSSLMODE==='require'?{rejectUnauthorized:false}:false,
 connectionTimeoutMillis:3000,query_timeout:3000});
(async()=>{try{await c.connect();const r=await c.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname = ANY($1)',
 [['identity','menu','inventory','orders','news']]);if(r.rows[0].count!==5)throw Error('schema');
 console.log('PASS configured database connection and five application schemas');
 }catch{process.exitCode=1;}finally{await c.end().catch(()=>{})}})();
'''
        try:
            output = run(['docker', 'run', '--rm', '-i', '--entrypoint', 'node',
                          'avengers/order-service:k8s-local', '-e', javascript], input=json.dumps(order))
        except ValueError:
            raise ValueError('Database audit failed: check configured credentials and restore the five application schemas; no data was changed') from None
        print(output.strip())
    elif args.action == 'ports':
        print(' '.join(published(services[n], p) for n, p in [('postgres-db',5432),('redis-cache',6379),('rabbitmq',5672)]))
    elif args.action == 'apply':
        context = os.getenv('K8S_CONTEXT', 'docker-desktop')
        if context != 'docker-desktop' and os.getenv('K8S_ALLOW_OTHER_CONTEXT') != '1':
            raise ValueError('Refusing a non-Docker-Desktop context without K8S_ALLOW_OTHER_CONTEXT=1')
        # Secret stringData is unsuitable for server-side apply ownership.
        for obj in objects:
            if obj['kind'] == 'Secret':
                obj['data'] = {key: base64.b64encode(value.encode()).decode()
                               for key, value in obj.pop('stringData').items()}
        run(['kubectl', '--context=' + context, '--request-timeout=15s', 'apply', '--server-side',
             '--field-manager=avengers-local-config', '-f', '-'], input=json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': objects}))
        print('Applied per-service ConfigMaps/Secrets without logging values. Restart existing pods after config changes.')
    else:
        print('Environment valid; DB mode=' + os.getenv('K8S_DB_MODE', 'compose') + '; secrets redacted')
        print('Compose infrastructure host ports: ' + ' / '.join(published(services[n], p) for n,p in [('postgres-db',5432),('redis-cache',6379),('rabbitmq',5672)]))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError, OSError):
        # Errors from this helper are sanitized; never include subprocess output/argv with secret values.
        exc = sys.exc_info()[1]
        print('ERROR: ' + (str(exc) if isinstance(exc, ValueError) else 'Local operation failed; inspect tool availability/configuration'), file=sys.stderr)
        sys.exit(1)
