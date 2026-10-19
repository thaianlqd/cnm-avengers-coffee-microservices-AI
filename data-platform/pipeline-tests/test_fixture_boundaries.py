"""Pipeline image is independent of API packages; API integration owns API tests."""
import ast
from pathlib import Path
from unittest import TestCase

ROOT = Path(__file__).resolve().parent
CATALOG_CASE = 'test_catalog_structure_is_readable_while_replica_replacement_holds_exclusive_lock'


class FixtureBoundaryTests(TestCase):
    def test_pipeline_integrations_do_not_import_api_only_packages(self):
        forbidden = {'services', 'tools', 'db', 'common', 'server'}
        for path in ROOT.glob('integration_*.py'):
            with self.subTest(module=path.name):
                for node in ast.walk(ast.parse(path.read_text())):
                    imports = ([node.module] if isinstance(node, ast.ImportFrom) else
                               [alias.name for alias in node.names] if isinstance(node, ast.Import) else [])
                    self.assertFalse(any(name and name.split('.')[0] in forbidden for name in imports),
                                     'API-owned integration must run in api-tests: '+path.name)

    def test_catalog_lock_regression_has_one_owner_in_api_acceptance_suite(self):
        owners = [path.name for path in ROOT.glob('*.py')
                  if any(isinstance(node, ast.FunctionDef) and node.name == CATALOG_CASE
                         for node in ast.walk(ast.parse(path.read_text())))]
        self.assertEqual(owners, ['acceptance_snapshot_reader.py'])
