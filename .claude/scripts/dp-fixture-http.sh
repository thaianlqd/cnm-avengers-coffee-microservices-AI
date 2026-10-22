#!/usr/bin/env bash
# Standalone acceptance process: no compose env/credentials, read-only source, fixture I/O.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec docker run --rm --name v33-followup-fixture -p 127.0.0.1:18765:8765 \
  -v "$ROOT/data-platform/analytics-api:/app:ro" \
  -e V33_FIXTURE_SERVER=1 -e PYTHONDONTWRITEBYTECODE=1 -e AI_OFFLINE=1 \
  -e DATA_ANALYST_ENV=development -e DATA_ANALYST_ALLOW_BROWSER_OWNER=1 -e DATA_ANALYST_SESSION_STORE=memory \
  -e DATA_ANALYST_ARTIFACT_STORE=memory \
  -e DATA_ANALYST_ALLOWED_ORIGINS=http://127.0.0.1:4173,http://127.0.0.1:4174 \
  "${DP_FIXTURE_IMAGE:-cnm-avengers-coffee-microservices-ai-analytics-api}" python -m tools.v33_fixture_server
