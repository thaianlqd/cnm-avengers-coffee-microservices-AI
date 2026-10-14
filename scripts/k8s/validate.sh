#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
need ruby
need kubectl
kubectl kustomize "${1:-k8s/overlays/docker-desktop}" | ruby scripts/k8s/validate-rendered.rb
