import importlib.util
import os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('k8s_environment', Path(__file__).resolve().parents[1] / 'environment.py')
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)


def fixture():
    services = {
        'postgres-db': {'environment': {'POSTGRES_USER': 'synthetic-user', 'POSTGRES_DB': 'synthetic-db'},
                        'ports': [{'target': 5432, 'published': '6543'}]},
        'redis-cache': {'ports': [{'target': 6379, 'published': '6388'}]},
        'rabbitmq': {'ports': [{'target': 5672, 'published': '5688'}]},
    }
    for name in env.SERVICES:
        services[name] = {'environment': {'DB_HOST': 'postgres-db', 'DB_PORT': '5432',
            'DB_USER': 'synthetic-user', 'DB_NAME': 'synthetic-db', 'DB_PASSWORD': 'compose-fallback',
            'JWT_SECRET': 'compose-fallback', 'VIETMAP_API_KEY': 'compose-fallback',
            'OPENAI_API_KEY': 'compose-fallback', 'NODE_ENV': 'production'}}
    values = {key: 'synthetic-' + key for key in (*env.REQUIRED, 'POSTGRES_PASSWORD', 'DB_PASSWORD', 'OPENAI_API_KEY')}
    return services, values


class EnvironmentTests(TestCase):
    def setUp(self):
        self.services, self.values = fixture()
        self.scope = patch.dict(os.environ, {}, clear=True)
        self.scope.start()
        self.addCleanup(self.scope.stop)

    def objects(self):
        return env.build_objects(self.services, self.values)

    def find(self, name, kind):
        return next(o for o in self.objects() if o['kind'] == kind and o['metadata']['name'].startswith(name + '-'))

    def test_published_ports_override_container_ports(self):
        config = self.find('order-service', 'ConfigMap')['data']
        self.assertEqual(config['DB_PORT'], '6543')
        self.assertEqual(config['REDIS_PORT'], '6388')
        self.assertEqual(config['DB_HOST'], 'host.docker.internal')
        self.assertEqual(config['PGSSLMODE'], 'disable')
        self.assertEqual(self.find('order-service', 'Secret')['stringData']['RABBITMQ_URL'], 'amqp://host.docker.internal:5688')

    def test_never_copy_compose_token_fallback(self):
        secrets = self.find('order-service', 'Secret')['stringData']
        self.assertNotIn('VIETMAP_API_KEY', secrets)
        self.assertEqual(secrets['JWT_SECRET'], self.values['JWT_SECRET'])

    def test_secret_values_do_not_enter_configmap(self):
        self.services['order-service']['environment']['SMTP_PASS'] = 'compose-fallback'
        self.values['SMTP_PASS'] = 'synthetic-smtp'
        for obj in self.objects():
            if obj['kind'] == 'ConfigMap':
                self.assertFalse(any(env.SENSITIVE.search(key) for key in obj['data']))

    def test_explicit_local_db_password_required(self):
        del self.values['POSTGRES_PASSWORD']
        with self.assertRaisesRegex(ValueError, 'POSTGRES_PASSWORD'):
            self.objects()

    def test_existing_remote_db_is_preserved(self):
        os.environ['K8S_DB_MODE'] = 'existing'
        self.services['menu-service']['environment'].update(DB_HOST='synthetic-remote.test', DB_PORT='6432', PGSSLMODE='require')
        config = self.find('menu-service', 'ConfigMap')['data']
        self.assertEqual(config['DB_HOST'], 'synthetic-remote.test')
        self.assertEqual(config['DB_PORT'], '6432')
        self.assertEqual(config['PGSSLMODE'], 'require')
        self.assertEqual(self.find('menu-service', 'Secret')['stringData']['DB_PASSWORD'], self.values['DB_PASSWORD'])

    def test_existing_local_db_uses_bridge(self):
        os.environ['K8S_DB_MODE'] = 'existing'
        config = self.find('menu-service', 'ConfigMap')['data']
        self.assertEqual(config['DB_HOST'], 'host.docker.internal')
        self.assertEqual(config['DB_PORT'], '6543')

    def test_internal_urls_use_service_dns(self):
        for obj in self.objects():
            if obj['kind'] == 'ConfigMap':
                self.assertEqual(obj['data']['ORDER_SERVICE_URL'], 'http://order-service:3005')
                self.assertEqual(obj['data']['AI_SERVICE_URL'], 'http://ai-service:8000')

    def test_authenticated_mq_url_preserves_auth_and_vhost(self):
        self.values['RABBITMQ_URL'] = 'amqp://synthetic:synthetic@rabbitmq:5672/synthetic-vhost'
        self.assertEqual(self.find('order-service', 'Secret')['stringData']['RABBITMQ_URL'],
                         'amqp://synthetic:synthetic@host.docker.internal:5688/synthetic-vhost')

    def test_frontend_has_only_public_build_args(self):
        args = env.frontend_args(self.values)
        self.assertEqual(args['VITE_SOCKET_URL'], 'http://localhost:3005')
        self.assertFalse(any(key in args for key in env.REQUIRED))
        self.assertNotIn('OPENAI_API_KEY', args)

    def test_config_mode_invalid_fails(self):
        os.environ['K8S_DB_MODE'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'K8S_DB_MODE'):
            self.objects()

    def test_custom_host_bridge(self):
        os.environ['K8S_INFRA_HOST'] = '192.0.2.1'
        self.assertEqual(self.find('order-service', 'ConfigMap')['data']['DB_HOST'], '192.0.2.1')

    def test_ambiguous_port_mapping_fails(self):
        self.services['postgres-db']['ports'].append({'target': 5432, 'published': '5433'})
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            self.objects()

    def test_subprocess_error_is_redacted(self):
        from subprocess import CompletedProcess
        with patch.object(env.subprocess, 'run', return_value=CompletedProcess([], 1, 'synthetic-secret', 'synthetic-secret')):
            with self.assertRaises(ValueError) as error:
                env.run(['synthetic-tool'])
        self.assertNotIn('synthetic-secret', str(error.exception))

    def test_generated_rollout_fingerprint_changes_with_config_without_plaintext(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as directory, patch.object(env, 'ROOT', Path(directory)), \
                patch.object(env, 'run', return_value='sha256:0123456789ab'):
            for path in ['avengers-coffee-system/apps/web-customer/public/images/products', 'avengers-coffee-system/shared/uploads']:
                (Path(directory) / path).mkdir(parents=True)
            folder = env.prepare_overlay(self.objects())
            first = (folder / 'kustomization.yaml').read_text()
            self.assertNotIn(self.values['JWT_SECRET'], first)
            self.assertEqual(len(json.loads(first)['patches']), 8)
            self.values['JWT_SECRET'] = 'synthetic-rotated'
            env.prepare_overlay(self.objects())
            self.assertNotEqual((folder / 'kustomization.yaml').read_text(), first)


if __name__ == '__main__':
    main()
