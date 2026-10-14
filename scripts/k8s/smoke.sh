#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
need curl
api="${BASE_URL:-http://localhost:3000}"
web="${WEB_URL:-http://localhost:5175}"
curl --fail --silent --show-error --max-time 10 "$web/" >/dev/null
for path in /health/live /health/ready /menu/danh-muc /menu/san-pham /users/branches/public '/news?page=1&limit=6'; do
  curl --fail --silent --show-error --max-time 15 "$api$path" >/dev/null
  printf 'PASS GET %s\n' "$path"
done
# Read-only auth availability: missing bearer token must be rejected by the real auth controller.
code="$(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' "$api/users/me")"
[[ "$code" == 401 ]] || fail "Auth boundary expected 401 for /users/me, got $code"
printf 'PASS auth availability/boundary (401 without credentials)\n'
