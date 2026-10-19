#!/usr/bin/env bash
# Local-only scanning; never mount the whole workspace or deployment credentials.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE=ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f
[ "$#" -gt 0 ] || { echo 'Usage: dp-scan-artifacts.sh artifact-directory [...]'; exit 2; }
for directory in "$@"; do
  [ -d "$directory" ] || { echo 'Required artifact directory unavailable'; exit 1; }
  directory="$(cd "$directory" && pwd)"
  docker run --rm --network none -v "$directory:/scan:ro" \
    -v "$ROOT/.github/gitleaks-data-platform.toml:/config.toml:ro" "$IMAGE" \
    dir /scan --config /config.toml --redact=100 --no-banner --exit-code=1 \
    --ignore-gitleaks-allow --max-archive-depth=2 --max-decode-depth=2
done
