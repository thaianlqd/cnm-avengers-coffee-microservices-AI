"""Synthetic schema, not live data. No database/provider calls."""

import json
from copy import deepcopy
from services.analysis_catalog import CATALOG_PATH


def physical_metadata():
    catalog = json.loads(CATALOG_PATH.read_text())
    tables = {
        name: {
            "qualified_name": name,
            "object_type": "view",
            "estimated_rows": 100,
            "columns": [
                {
                    "name": col,
                    "data_type": desc.get("type", "text"),
                    "nullable": True,
                    "primary_key": col in table.get("primary_key", []),
                    "sensitive": False,
                }
                for col, desc in table["columns"].items()
            ],
            "primary_key": table.get("primary_key", []),
            "relationships": [],
        }
        for name, table in catalog["silver_tables"].items()
    }
    return {
        "table_map": tables,
        "tables": list(tables.values()),
        "table_count": len(tables),
        "refreshed_at": "fixture",
    }


def ranking_spec(**updates):
    value = {
        "analysis_kind": "ranking",
        "subject": "products",
        "metrics": ["quantity_sold"],
        "dimensions": ["product"],
        "filters": [{"dimension": "city", "value": "Hà Nội"}],
        "time_range": {"mode": "custom", "start": "2026-10-01", "end": "2026-10-31"},
        "ranking": {"metric": "quantity_sold", "direction": "DESC", "top_n": 5},
    }
    value.update(updates)
    return value


def ranked_rows(n=5):
    return [
        {
            "product": f"Món {i+1}",
            "product_id": str(i + 1),
            "quantity_sold": 100 - i * 10,
        }
        for i in range(n)
    ]


def result(rows):
    return {
        "rows": deepcopy(rows),
        "columns": (
            list(rows[0]) if rows else ["product", "product_id", "quantity_sold"]
        ),
        "truncated": False,
        "count": len(rows),
    }
