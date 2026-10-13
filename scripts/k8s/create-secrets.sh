#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
need docker
need python3
python3 scripts/k8s/environment.py check
k apply -f k8s/base/namespace.yaml
python3 scripts/k8s/environment.py apply
