#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
need docker
need kubectl
need python3
need lsof
printf 'Host: %s; Bash %s\n' "$(uname -sm)" "$BASH_VERSION"
[[ "$(uname -m)" == arm64 ]] || fail 'Native Apple Silicon arm64 host expected.'
docker info --format '{{.OSType}}/{{.Architecture}} CPUs={{.NCPU}} Memory={{.MemTotal}}'
[[ "$(docker info --format '{{.Architecture}}')" == aarch64 ]] || fail 'Docker is not running native arm64.'
memory="$(docker info --format '{{.MemTotal}}')"
[[ "$memory" -ge 7516192768 ]] || fail 'Allocate about 8 GiB RAM to Docker Desktop for this demo.'
python3 scripts/k8s/environment.py check
running_apps="$(docker compose ps --status running --services)"
while IFS= read -r service; do
  for expected in "${K8S_DEPLOYMENTS[@]}"; do
    [[ "$service" != "$expected" ]] || fail "Compose application $service is still running; stop the customer application layer before deploying Kubernetes copies."
  done
done <<< "$running_apps"
guard_context
printf 'Target context: %s (current: %s)\n' "$K8S_CONTEXT" "$(kubectl config current-context)"
k wait --for=condition=Ready node --all --timeout=30s
k get nodes -o custom-columns=NAME:.metadata.name,ARCH:.status.nodeInfo.architecture
node_arch="$(k get nodes -o jsonpath='{.items[0].status.nodeInfo.architecture}')"
[[ "$node_arch" == arm64 ]] || fail 'The Kubernetes node must be arm64 for the native images.'
for port in 5175 3000 3005; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    # Rerunning deploy is allowed when the namespace already owns that exposure.
    if ! k -n "$K8S_NAMESPACE" get service -o json | python3 -c 'import json,sys; p=int(sys.argv[1]); sys.exit(0 if any(s["spec"].get("type")=="LoadBalancer" and any(x["port"]==p for x in s["spec"]["ports"]) for s in json.load(sys.stdin)["items"]) else 1)' "$port"; then
      fail "Port $port is occupied. Stop only conflicting Compose app services; see K8S_DEMO_GUIDE.md."
    fi
  fi
done
k top nodes || fail 'Metrics Server unavailable; follow k8s/addons/metrics-server/README.md.'
k top pods -A || fail 'Pod metrics unavailable; wait for Metrics Server to collect samples.'
printf 'Preflight passed. Pod-to-host reachability is checked by deploy.sh.\n'
