"""Preflight latency benchmark over the frozen V3.3 case matrix (0 provider, 0 warehouse).

Cold init (catalog + first request) is measured separately and never mixed into the warm request latency.
Usage: python -m tools.benchmark_preflight [--repeats 60] [--out evaluation/v33/preflight_benchmark.json]"""
import argparse
import json
import pathlib
import platform
import time
from datetime import date

COVERAGE = {"status": "ready", "overall": {"min_date": "2026-01-01", "max_date": "2026-10-16"}, "facts": {},
            "freshness": {"mode": "batch", "stale": False}}
CASES = pathlib.Path(__file__).resolve().parents[1] / "evals/semantic_cases_v33.json"


def measure(repeats=60):
    from services import preflight_service as pf
    cases = json.loads(CASES.read_text())["cases"]
    started = time.perf_counter()
    # Force a fresh local catalog without clearing a serving process's cache.
    # A prior unittest may already have warmed preflight_catalog().
    overlay=json.loads(pf.CATALOG_PATH.read_text())
    catalog=pf.AnalysisCatalog(pf.overlay_physical(overlay),overlay)
    catalog_ms = (time.perf_counter() - started) * 1000
    reference = date(2026, 10, 16)
    started = time.perf_counter()
    pf.run(cases[0]["q"], None, cases[0].get("scope"), cases[0].get("mission"), reference, catalog=catalog, coverage=COVERAGE)
    first_ms = (time.perf_counter() - started) * 1000
    latencies = []
    for _ in range(repeats):
        for case in cases:
            started = time.perf_counter()
            pf.run(case["q"], None, case.get("scope"), case.get("mission"), reference, catalog=catalog, coverage=COVERAGE)
            latencies.append((time.perf_counter() - started) * 1000)
    latencies.sort()
    pct = lambda p: round(latencies[min(len(latencies) - 1, int(len(latencies) * p))], 2)
    return {"cases": len(cases), "requests": len(latencies), "cold_catalog_ms": round(catalog_ms, 1), "first_request_ms": round(first_ms, 1),
            "warm_p50_ms": pct(.5), "warm_p95_ms": pct(.95), "warm_max_ms": round(latencies[-1], 2),
            "environment": {"python": platform.python_version(), "machine": platform.machine(), "note": "analytics-api container, warm, single thread"}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=60)
    parser.add_argument("--out")
    args = parser.parse_args()
    result = measure(args.repeats)
    print(json.dumps(result, ensure_ascii=False))
    if args.out:
        pathlib.Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
