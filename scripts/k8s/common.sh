#!/usr/bin/env bash
set -euo pipefail
K8S_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$K8S_ROOT"
K8S_NAMESPACE=avengers-coffee
K8S_CONTEXT="${K8S_CONTEXT:-docker-desktop}"
K8S_DEPLOYMENTS=(web-customer api-gateway identity-service menu-service inventory-service order-service news-service ai-service)
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "Required command missing: $1"; }
k() { kubectl --context="$K8S_CONTEXT" --request-timeout=15s "$@"; }
guard_context() {
  need kubectl
  if [[ "$K8S_CONTEXT" != docker-desktop && "${K8S_ALLOW_OTHER_CONTEXT:-0}" != 1 ]]; then
    fail 'Only docker-desktop is allowed. Set K8S_CONTEXT and K8S_ALLOW_OTHER_CONTEXT=1 deliberately to override.'
  fi
  [[ "$(kubectl config get-contexts "$K8S_CONTEXT" -o name)" == "$K8S_CONTEXT" ]] || fail 'Enable Kubernetes in Docker Desktop Settings and wait for docker-desktop context.'
}
