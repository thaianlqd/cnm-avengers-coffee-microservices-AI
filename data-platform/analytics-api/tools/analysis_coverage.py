"""Offline semantic inventory, not a claim about memorized sentence coverage."""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from services.analysis_catalog import AnalysisCatalog
from services.analysis_contract import (
    AnalysisSpec,
    TimeSpec,
    TimeScope,
)
from tests.analysis_fixtures import physical_metadata
from services.analyst_contract import AnalyticalQuery, DashboardVisual


def inventory(catalog):
    r = catalog.registry
    return {
        "note": "Supported definitions/operators in the current catalog. Physical availability is fixture-derived; no live warehouse or NLP accuracy claim.",
        "schema_fingerprint": catalog.fingerprint,
        "counts": {key: len(r[key]) for key in ("subjects", "metrics", "dimensions")},
        "subjects": [
            {
                "id": sid,
                "label": s["business_name"],
                "grain": s["grain"],
                "metrics": s["metrics"],
            }
            for sid, s in r["subjects"].items()
        ],
        "metrics": [
            {
                "id": mid,
                "label": m["business_name"],
                "unit": m["unit"],
                "grain": m["grain"],
                "subjects": m["subjects"],
                "has_time": bool(m.get("time_column")),
                "compatible_dimensions": catalog.compatible_dimensions(mid),
            }
            for mid, m in r["metrics"].items()
        ],
        "dimensions": [
            {
                "id": did,
                "label": d["business_name"],
                "value_policy": d.get("value_grounding", {}).get("mode", "catalog"),
            }
            for did, d in r["dimensions"].items()
        ],
        "analysis_operators": AnalyticalQuery.model_json_schema()["properties"][
            "operation"
        ]["enum"],
        "relative_time_modes": TimeScope.model_json_schema()["properties"]["mode"][
            "enum"
        ],
        "intermediate_time_kinds": TimeSpec.model_json_schema()["properties"]["kind"][
            "enum"
        ],
        "granularities": AnalysisSpec.model_json_schema()["properties"]["granularity"][
            "enum"
        ],
        "chart_types": DashboardVisual.model_json_schema()["properties"]["chart_type"][
            "enum"
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output", type=Path, default=ROOT / "docs/SEMANTIC_COVERAGE_V22.json"
    )
    args = parser.parse_args()
    report = inventory(AnalysisCatalog(physical_metadata()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {"counts": report["counts"], "operators": report["analysis_operators"]},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
