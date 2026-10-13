#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
need docker
need python3
[[ "$(docker info --format '{{.Architecture}}')" == aarch64 ]] || fail 'This demo expects a native arm64 Docker engine.'
python3 scripts/k8s/environment.py build
