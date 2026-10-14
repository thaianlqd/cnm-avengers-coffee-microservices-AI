import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class RenderedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rendered = subprocess.check_output(['kubectl', 'kustomize', 'k8s/overlays/docker-desktop'], cwd=ROOT, text=True)
        cls.docs = json.loads(subprocess.check_output(['ruby', '-ryaml', '-rjson', '-e',
            'puts JSON.generate(YAML.load_stream(STDIN.read).compact)'], input=rendered, text=True))

    def validate(self, docs):
        text = '\n---\n'.join(json.dumps(doc) for doc in docs)
        return subprocess.run(['ruby', 'scripts/k8s/validate-rendered.rb'], cwd=ROOT,
                              input=text, text=True, capture_output=True)

    def test_actual_overlay_passes(self):
        result = self.validate(self.docs)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_duplicate_service_name_is_rejected(self):
        docs = json.loads(json.dumps(self.docs))
        service = next(o for o in docs if o['kind']=='Service' and o['metadata']['name']=='web-customer')
        service['spec']['ports'].append(dict(service['spec']['ports'][0], port=80))
        self.assertNotEqual(self.validate(docs).returncode, 0)

    def test_selector_and_target_port_mismatch_are_rejected(self):
        docs = json.loads(json.dumps(self.docs))
        service = next(o for o in docs if o['kind']=='Service' and o['metadata']['name']=='api-gateway')
        service['spec']['selector']['app.kubernetes.io/name']='missing'
        service['spec']['ports'][0]['targetPort']='missing'
        self.assertNotEqual(self.validate(docs).returncode, 0)


if __name__=='__main__':
    unittest.main()
