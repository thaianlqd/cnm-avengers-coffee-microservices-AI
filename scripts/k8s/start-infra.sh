#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
need docker
docker compose config --quiet
docker compose up -d --no-deps --wait --wait-timeout 240 postgres-db redis-cache rabbitmq
docker compose ps --format '{{.Service}} {{.State}} {{.Health}}' postgres-db redis-cache rabbitmq
