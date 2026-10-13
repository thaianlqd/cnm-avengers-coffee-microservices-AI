#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
ready="$(k -n "$K8S_NAMESPACE" get deployment api-gateway -o jsonpath='{.status.readyReplicas}')"
[[ "${ready:-0}" -ge 2 ]] || fail 'Need at least two Ready gateway replicas before deleting one.'
pod="$(k -n "$K8S_NAMESPACE" get pods -l app.kubernetes.io/name=api-gateway -o json | python3 -c 'import json,sys; print(next(p["metadata"]["name"] for p in json.load(sys.stdin)["items"] if not p["metadata"].get("deletionTimestamp") and any(c["type"]=="Ready" and c["status"]=="True" for c in p["status"].get("conditions", []))))')"
printf 'Deleting one gateway Pod: %s\n' "$pod"
k -n "$K8S_NAMESPACE" delete pod "$pod" --wait=false
k -n "$K8S_NAMESPACE" wait --for=delete "pod/$pod" --timeout=90s
k -n "$K8S_NAMESPACE" rollout status deployment/api-gateway --timeout=180s
k -n "$K8S_NAMESPACE" get pods -l app.kubernetes.io/name=api-gateway -o wide
