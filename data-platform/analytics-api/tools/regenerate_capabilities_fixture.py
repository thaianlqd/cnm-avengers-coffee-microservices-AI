"""Regenerate tests/fixtures/capabilities_v31.json from the governed registry.

The web-ui tests render against this backend-generated fixture; regenerate it
after any registry change (offline, no warehouse, no provider):
    python -m tools.regenerate_capabilities_fixture
"""
import json
from pathlib import Path

from services.analysis_catalog import AnalysisCatalog
from services.domain_intelligence_service import DomainIntelligence
from tests.analysis_fixtures import physical_metadata

PATH = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "capabilities_v31.json"


def main():
    coverage = json.loads(PATH.read_text())["data_coverage"]  # keep the fixed test coverage snapshot
    capabilities = DomainIntelligence(AnalysisCatalog(physical_metadata())).capabilities(coverage=coverage)
    PATH.write_text(json.dumps(capabilities, ensure_ascii=False, indent=2) + "\n")
    print("written", PATH.name, capabilities["registry_fingerprint"][:12])


if __name__ == "__main__":
    main()
