#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
k delete namespace "$K8S_NAMESPACE" --ignore-not-found --wait=true --timeout=180s
printf 'Only the Avengers Kubernetes namespace was removed. Compose data/containers are retained.\n'
