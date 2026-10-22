#!/bin/sh
set -eu

cd /app
expected=$(sha256sum package-lock.json | cut -d ' ' -f 1)
installed=$(cat node_modules/.avengers-package-lock-sha256 2>/dev/null || true)
if [ "$expected" != "$installed" ]; then
  echo 'Dependencies changed; syncing web-customer node_modules...'
  npm ci
  printf '%s\n' "$expected" > node_modules/.avengers-package-lock-sha256
fi
exec "$@"
