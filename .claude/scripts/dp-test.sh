#!/usr/bin/env bash
# Chạy test data-platform và CHỈ in phần tóm tắt + test lỗi (tiết kiệm token).
# Log đầy đủ ghi ra $LOG_DIR (mặc định /tmp/dp-test) để đọc khi thật sự cần (grep, không cat).
#
# Dùng:
#   .claude/scripts/dp-test.sh backend              # full analytics-api (~8 phút), baseline: xem rules/data-platform.md
#   .claude/scripts/dp-test.sh module tests.test_x  # 1..n module analytics-api (offline, env như runner)
#   .claude/scripts/dp-test.sh web                  # web-ui: node --test + typecheck + build
#   .claude/scripts/dp-test.sh eval                 # eval ngữ nghĩa offline (146 ca)
#   .claude/scripts/dp-test.sh e2e                  # Playwright (Chromium) browser journeys, API mock/deferred
#   .claude/scripts/dp-test.sh all                  # backend → web → eval → e2e (tuần tự, tránh tranh CPU)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${LOG_DIR:-/tmp/dp-test}"; mkdir -p "$LOG_DIR"
DC=(docker compose -f "$ROOT/docker-compose.data.yml" exec -T analytics-api)
OFFLINE=(env -u DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN -u DATA_ANALYST_ENABLE_CONTRACT_REPAIR -u DATA_ANALYST_GEMINI_SECONDARY_KEY AI_OFFLINE=1
         DATA_ANALYST_ENV=development DATA_ANALYST_ALLOW_BROWSER_OWNER=1 DATA_ANALYST_SESSION_STORE=memory DATA_ANALYST_ARTIFACT_STORE=memory)

unittest_summary() {  # $1 = log
  grep -E "^(ERROR|FAIL):" "$1" | head -20
  grep -E "^Ran |^OK|^FAILED" "$1"
  # Traceback ngắn của tối đa 3 lỗi đầu (đủ để biết nguyên nhân).
  awk '/^(ERROR|FAIL): /{n++} n>=1&&n<=3' "$1" | grep -E "Error|assert|File \"/app/(services|routers|tests)" | head -15 || true
}

backend() {
  local log="$LOG_DIR/backend.log"
  "${DC[@]}" python -m tools.run_tests_v29 >"$log" 2>&1; local rc=$?
  echo "== backend (log: $log)"; unittest_summary "$log"
  return $rc
}

module() {
  local log="$LOG_DIR/module.log"
  "${DC[@]}" "${OFFLINE[@]}" python -m unittest "$@" >"$log" 2>&1; local rc=$?
  echo "== module $* (log: $log)"; unittest_summary "$log"
  return $rc
}

web() {
  local dir="$ROOT/data-platform/web-ui" log="$LOG_DIR/web.log" rc=0
  (cd "$dir" && node --test src/utils/*.test.mjs) >"$log" 2>&1 || rc=1
  echo "== web-ui tests (log: $log)"; grep -E "^# (tests|pass|fail)" "$log"
  grep -E "^not ok" "$log" | head -10 || true
  (cd "$dir" && npm run typecheck) >"$LOG_DIR/typecheck.log" 2>&1 && echo "typecheck PASS" || { rc=1; echo "typecheck FAIL"; grep -E "error TS" "$LOG_DIR/typecheck.log" | head -10; }
  (cd "$dir" && npm run build) >"$LOG_DIR/build.log" 2>&1 && echo "build PASS" || { rc=1; echo "build FAIL"; tail -15 "$LOG_DIR/build.log"; }
  return $rc
}

e2e() {
  local dir="$ROOT/data-platform/web-ui" log="$LOG_DIR/e2e.log" app
  # Reuse an already installed Chromium when Playwright's pinned revision is not downloaded (no network needed).
  if [ -z "${PW_CHROMIUM:-}" ]; then
    app=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/*.app 2>/dev/null | tail -1)
    [ -n "$app" ] && export PW_CHROMIUM="$app/Contents/MacOS/$(basename "$app" .app)"
  fi
  (cd "$dir" && npm run test:e2e) >"$log" 2>&1; local rc=$?
  echo "== e2e (log: $log)"; grep -E "passed|failed|✘" "$log" | head -12
  return $rc
}

eval_offline() {
  "${DC[@]}" "${OFFLINE[@]}" python -m evals.semantic_eval_v30 --mode offline --out /tmp/dp_eval.json >"$LOG_DIR/eval.log" 2>&1 || { tail -15 "$LOG_DIR/eval.log"; return 1; }
  echo "== eval offline"
  "${DC[@]}" python -c "
import json;d=json.load(open('/tmp/dp_eval.json'))
keys=('retrieval_domain','retrieval_metric','compile_level2','preflight_expectations','unsupported_preflight','forecast_capability_rejections','v33_cases','v34_cases')
print(d['case_count'],'ca ·',' · '.join(f\"{k} {d[k]['passed']}/{d[k]['total']}\" for k in keys if k in d))
print('failures:',[f['id'] for f in d.get('failures',[])])
raise SystemExit(1 if d.get('failures') else 0)"
}

case "${1:-}" in
  backend) backend; exit $? ;;
  module) shift; module "$@"; exit $? ;;
  web) web; exit $? ;;
  eval) eval_offline; exit $? ;;
  e2e) e2e; exit $? ;;
  all) rc=0; backend || rc=1; web || rc=1; eval_offline || rc=1; e2e || rc=1; exit $rc ;;
  *) sed -n 2,11p "$0"; exit 2 ;;
esac
