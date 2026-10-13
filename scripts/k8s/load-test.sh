#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
profile="${1:-smoke}"
case "$profile" in smoke|moderate) ;; *) fail 'Use smoke or moderate.' ;; esac
export PROFILE="$profile"
if [[ "$profile" == moderate ]]; then
  guard_context
  metrics_ready=0
  for ((attempt=0;attempt<9;attempt++)); do
    if k -n "$K8S_NAMESPACE" get hpa -o json | python3 -c 'import json,sys; rows=json.load(sys.stdin)["items"]; sys.exit(0 if len(rows)==3 and all(any(m.get("resource",{}).get("current",{}).get("averageUtilization") is not None for m in r.get("status",{}).get("currentMetrics",[])) for r in rows) else 1)'; then
      metrics_ready=1
      break
    fi
    printf 'Waiting for current HPA CPU metrics...\n'
    sleep 10
  done
  [[ "$metrics_ready" == 1 ]] || fail 'HPA CPU metrics unavailable; refusing moderate load.'
fi
results="${K8S_LOAD_RESULTS:-/tmp/avengers-k8s-load-results}"
mkdir -p "$results"
export SUMMARY_FILE="${SUMMARY_FILE:-$results/k6-$profile.json}"
if [[ -n "${K6_BIN:-}" ]]; then
  [[ -x "$K6_BIN" ]] || fail 'K6_BIN must point to an executable native k6 binary.'
  "$K6_BIN" run load-tests/k6/customer-browse.js
elif [[ "${K8S_LOAD_USE_DOCKER:-0}" == 1 ]]; then
  need docker
  args=(--rm -v "$K8S_ROOT/load-tests/k6:/scripts:ro" -v "$results:/results"
        -e "PROFILE=$profile" -e "BASE_URL=${K8S_DOCKER_LOAD_BASE_URL:-http://host.docker.internal:3000}"
        -e "SUMMARY_FILE=/results/$(basename "$SUMMARY_FILE")")
  for name in WARMUP_VUS STEP1_VUS STEP2_VUS STEP3_VUS STEP4_VUS THINK_SECONDS SMOKE_VUS SMOKE_DURATION; do
    [[ -z "${!name:-}" ]] || args+=(-e "$name=${!name}")
  done
  docker run "${args[@]}" grafana/k6:0.57.0 run /scripts/customer-browse.js
elif [[ -x "$K8S_ROOT/.tools/k6/0.57.0/k6" ]]; then
  bash scripts/k8s/install-k6-local.sh
  "$K8S_ROOT/.tools/k6/0.57.0/k6" run load-tests/k6/customer-browse.js
elif command -v k6 >/dev/null; then
  k6 run load-tests/k6/customer-browse.js
else
  fail 'Native k6 is required for the qualified localhost demo. Run: bash scripts/k8s/install-k6-local.sh. Docker diagnostics require K8S_LOAD_USE_DOCKER=1 explicitly.'
fi
