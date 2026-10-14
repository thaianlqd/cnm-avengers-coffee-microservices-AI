#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
[[ "${K8S_DB_MODE:-}" == existing ]] || fail 'Export K8S_DB_MODE=existing first.'
[[ "$K8S_CONTEXT" == docker-desktop ]] || fail 'Capacity qualification targets docker-desktop only.'
guard_context
exec python3 scripts/k8s/capacity.py "${1:?Usage: capacity-test.sh VUS}" "${@:2}"
