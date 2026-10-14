#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
deployment="${1:-api-gateway}"
case "$deployment" in api-gateway|web-customer|menu-service|identity-service) ;; *) fail 'Choose gateway, web-customer, menu-service or identity-service.' ;; esac
k -n "$K8S_NAMESPACE" rollout restart "deployment/$deployment"
k -n "$K8S_NAMESPACE" rollout status "deployment/$deployment" --timeout=180s
