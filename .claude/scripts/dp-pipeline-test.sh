#!/usr/bin/env bash
# Reproducible pipeline fixture harness; no production compose/env/ports used.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${LOG_DIR:-/tmp/v34-pipeline-checks}"
mkdir -p "$LOG_DIR"
DC=(docker compose -p avengers-v34-fixture -f "$ROOT/data-platform/pipeline-tests/compose.fixture.yml")
case "${1:-unit}" in
  unit)
    "${DC[@]}" build tests >"$LOG_DIR/build.log" 2>&1
    # Run directly: compose run would start dependencies. Unit tests have no network.
    docker run --rm --network none -e PYTHONDONTWRITEBYTECODE=1 \
      -v "$ROOT/data-platform/pipeline-common:/workspace/pipeline-common:ro" \
      -v "$ROOT/data-platform/pipeline-tests:/workspace/pipeline-tests:ro" \
      -v "$ROOT/data-platform/data-sync:/workspace/data-sync:ro" \
      -v "$ROOT/data-platform/kafka-producer:/workspace/kafka-producer:ro" \
      -v "$ROOT/data-platform/spark-jobs:/workspace/spark-jobs:ro" \
      -v "$ROOT/data-platform/kafka-consumer:/workspace/kafka-consumer:ro" \
      -v "$ROOT/data-platform/metadata:/workspace/metadata:ro" \
      -v "$ROOT/data-platform/analytics-api/metadata/warehouse_views.json:/workspace/analytics-api/metadata/warehouse_views.json:ro" \
      -v "$ROOT/data-platform/evaluation/v34/implementation-20261018:/workspace/evaluation/v34/implementation-20261018:ro" \
      avengers-v34-pipeline-tests >"$LOG_DIR/unit.log" 2>&1 || { tail -35 "$LOG_DIR/unit.log"; exit 1; }
    tail -5 "$LOG_DIR/unit.log"
    ;;
  integration)
    "${DC[@]}" build >"$LOG_DIR/build.log" 2>&1
    "${DC[@]}" up -d --wait postgres minio kafka redis >"$LOG_DIR/start.log" 2>&1
    "${DC[@]}" run --rm tests >"$LOG_DIR/integration.log" 2>&1 || { tail -45 "$LOG_DIR/integration.log"; exit 1; }
    tail -5 "$LOG_DIR/integration.log"
    "${DC[@]}" run --rm api-tests >"$LOG_DIR/api-acceptance.log" 2>&1 || { tail -45 "$LOG_DIR/api-acceptance.log"; exit 1; }
    tail -5 "$LOG_DIR/api-acceptance.log"
    ;;
  stop)
    # Retain all fixture state for diagnosis. Never down -v or touch production.
    "${DC[@]}" stop
    ;;
  *) echo 'Usage: dp-pipeline-test.sh unit|integration|stop' >&2; exit 2 ;;
esac
