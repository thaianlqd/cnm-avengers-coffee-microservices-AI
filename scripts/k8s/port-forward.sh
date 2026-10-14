#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Alternate local ports also work if the LoadBalancer already owns the defaults.
k -n "$K8S_NAMESPACE" port-forward --address=127.0.0.1 service/web-customer "${K8S_WEB_FORWARD_PORT:-5175}:5175" & pids+=("$!")
k -n "$K8S_NAMESPACE" port-forward --address=127.0.0.1 service/api-gateway "${K8S_API_FORWARD_PORT:-3000}:3000" & pids+=("$!")
k -n "$K8S_NAMESPACE" port-forward --address=127.0.0.1 service/order-service "${K8S_SOCKET_FORWARD_PORT:-3005}:3005" & pids+=("$!")
while true; do
  for pid in "${pids[@]}"; do kill -0 "$pid" 2>/dev/null || fail 'One port-forward stopped; restart this helper.'; done
  sleep 2
done
