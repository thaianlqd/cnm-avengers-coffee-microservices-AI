#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
for deployment in "${K8S_DEPLOYMENTS[@]}"; do
  k -n "$K8S_NAMESPACE" rollout status "deployment/$deployment" --timeout="${K8S_READY_TIMEOUT:-300s}"
done
