#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
need curl
mode="${1:-healing}"
case "$mode" in healing|rollout) ;; *) fail 'Use healing or rollout.' ;; esac
report="$(mktemp -t avengers-availability.XXXXXX)"
probe_pid=''
cleanup() { [[ -z "$probe_pid" ]] || kill "$probe_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
(
  for ((i=0;i<60;i++)); do
    code="$(curl --silent --show-error --max-time 2 -o /dev/null -w '%{http_code}' "${BASE_URL:-http://localhost:3000}/menu/danh-muc" 2>/dev/null)" || code=000
    printf '%s %s\n' "$(date +%H:%M:%S)" "$code"
    sleep 1
  done
) > "$report" & probe_pid="$!"
if [[ "$mode" == healing ]]; then
  bash scripts/k8s/demo-self-healing.sh
else
  bash scripts/k8s/demo-rollout.sh api-gateway
fi
wait "$probe_pid"
probe_pid=''
python3 - "$report" <<'PY'
import sys
from pathlib import Path
rows = Path(sys.argv[1]).read_text().splitlines()
bad = [row for row in rows if row.split()[-1] != '200']
print('Availability samples:', len(rows), 'failed:', len(bad), 'report:', sys.argv[1])
print('PASS' if not bad and len(rows) == 60 else 'FAIL')
sys.exit(bool(bad) or len(rows) != 60)
PY
