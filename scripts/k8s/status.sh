#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
k get nodes
k -n "$K8S_NAMESPACE" get pods,deployments,services,hpa,pdb -o wide
k top nodes || printf 'Node metrics unavailable. See k8s/addons/metrics-server/README.md\n'
k -n "$K8S_NAMESPACE" top pods || printf 'Pod metrics unavailable. HPA cannot scale without metrics.\n'
k -n "$K8S_NAMESPACE" get events --field-selector type=Warning --sort-by=.lastTimestamp
