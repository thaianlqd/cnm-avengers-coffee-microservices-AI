#!/usr/bin/env bash
# Isolated dual-API fixture; requires an existing API image. Never starts MinIO.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
case "${1:-}" in
  start) entries='a:18881 b:18882' ;;
  start-a) entries='a:18881' ;;
  start-b) entries='b:18882' ;;
  *) echo 'Usage: dp-v35-two-api.sh start|start-a|start-b'; exit 2 ;;
esac
docker compose -p avengers-v34-fixture -f data-platform/pipeline-tests/compose.fixture.yml up -d --no-deps postgres redis
for entry in $entries; do
  name="v35-fixture-api-${entry%:*}"; port="${entry#*:}"
  docker run -d --rm --pull never --name "$name" --label codex.goal=v35-fixture --cpus=0.15 --memory=384m \
    --network container:avengers-v34-fixture-postgres-1 \
    -e V35_FIXTURE_SERVER=1 -e V35_INSTANCE="$name" -e AI_OFFLINE=1 -e DATA_ANALYST_ENV=development \
    -e DATA_ANALYST_ALLOW_BROWSER_OWNER=1 -e DATA_ANALYST_SESSION_STORE=redis -e DATA_ANALYST_ARTIFACT_STORE=redis \
    -e DATA_ANALYST_ALLOWED_ORIGINS=http://127.0.0.1:4173 \
    -e DATA_ANALYST_REDIS_URL=redis://127.0.0.1:16379/15 \
    -v "$ROOT/data-platform/analytics-api/tools/v35_fixture_server.py:/app/tools/v35_fixture_server.py:ro" \
    -v "$ROOT/data-platform/analytics-api/services:/app/services:ro" \
    -v "$ROOT/data-platform/analytics-api/metadata:/app/metadata:ro" \
    -v "$ROOT/data-platform/analytics-api/common.py:/app/common.py:ro" \
    -v "$ROOT/data-platform/analytics-api/routers:/app/routers:ro" \
    --entrypoint python cnm-avengers-coffee-microservices-ai-analytics-api \
    -m uvicorn tools.v35_fixture_server:app --host 127.0.0.1 --port "$port" --no-access-log
done
