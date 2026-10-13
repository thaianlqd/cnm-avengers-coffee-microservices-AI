#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
bash scripts/k8s/preflight.sh
for name in "${K8S_DEPLOYMENTS[@]}"; do
  [[ "$(docker image inspect "avengers/$name:k8s-local" --format '{{.Architecture}}')" == arm64 ]] || fail "Missing native image: $name; run build-images.sh"
done
# No application startup/worker is allowed against a missing demo database.
python3 scripts/k8s/environment.py audit
python3 scripts/k8s/environment.py media
python3 scripts/k8s/environment.py prepare-configured >/dev/null
overlay=k8s/overlays/.docker-desktop-runtime
# Validate against the real server before mutating application workloads.
bash scripts/k8s/validate.sh "$overlay"
k apply -f k8s/base/namespace.yaml
bash scripts/k8s/create-secrets.sh
k apply --dry-run=server -k "$overlay" >/dev/null
k apply -k "$overlay"
bash scripts/k8s/wait-ready.sh
bash scripts/k8s/check-connectivity.sh
bash scripts/k8s/smoke.sh
bash scripts/k8s/status.sh
printf '\nWeb: http://localhost:5175\nAPI: http://localhost:3000\nSocket.IO: http://localhost:3005\n'
