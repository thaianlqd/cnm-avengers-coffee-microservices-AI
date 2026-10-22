"""The inventory must describe real imports and routes without executing code."""
from pathlib import Path
import tempfile
from unittest import TestCase

from tools.architecture_inventory import inventory


class ArchitectureInventoryTests(TestCase):
    def test_lazy_import_cycle_and_router_reachability_without_module_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'services').mkdir()
            (root / 'routers').mkdir()
            (root / 'server.py').write_text('from services import a\n')
            (root / 'services/a.py').write_text('raise RuntimeError("MUST NOT EXECUTE")\ndef run():\n from services.b import helper\n')
            (root / 'services/b.py').write_text('from services import a\ndef helper():\n pass\n')
            (root / 'services/tool_only.py').write_text('def utility():\n pass\n')
            (root / 'routers/read.py').write_text('router = APIRouter(prefix="/api")\n@router.get("/read")\ndef read():\n from services import b\n')
            result = inventory(root)
            self.assertEqual(result['service_modules'], 3)
            self.assertEqual(result['service_import_edges'], 2)
            self.assertEqual(result['router_import_reachable'], 2)
            self.assertEqual(result['not_router_import_reachable'], ['tool_only'])
            self.assertEqual(result['strongly_connected_components'][0], ['a', 'b'])
            self.assertEqual(result['routes'][0]['path'], '/api/read')
            self.assertEqual(result['routes'][0]['method'], 'GET')

    def test_plain_dotted_imports_are_not_invisible_to_the_graph(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'services').mkdir()
            (root / 'routers').mkdir()
            (root / 'server.py').write_text('import services.a\n')
            (root / 'services/a.py').write_text('import services.b\n')
            (root / 'services/b.py').write_text('pass\n')
            result = inventory(root)
            self.assertEqual(result['router_import_reachable'], 2)
            self.assertEqual(result['service_import_edges'], 1)

    def test_inventory_is_deterministic_across_repeated_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'services').mkdir()
            (root / 'routers').mkdir()
            (root / 'server.py').write_text('from services import z\n')
            (root / 'services/z.py').write_text('def run():\n return 1\n')
            self.assertEqual(inventory(root), inventory(root))
