# V3.4 implementation checkpoint — chưa là release acceptance

Phạm vi tiếp tục: toàn bộ NOW Phase0–8 trong [PLAN](../../../AI_V34_PLATFORM_MATURITY_PLAN.md), không đổi goal thành vài patch. [Progress](../../../AI_V34_PLATFORM_MATURITY_PLAN.progress.md) ghi trạng thái từng phase. Working tree chưa commit; API/web đã được đồng bộ một phần sau phản hồi dashboard trống; migrations026/027/028 đã áp theo approval cụ thể. Xem runtime-deployment-20261018.json và cập nhật runtime trong progress; chưa là release acceptance.

## Bằng chứng mới nhất

| Nhóm | Kết quả đã chạy | Artifact / giới hạn |
|---|---|---|
| Baseline trước product edits |1063 backend,165web,146old+33V33eval,12mocked browser PASS | `baseline.json`, `baseline-summary.txt`; không phải full V3.4 hiện tại |
| Semantic corpus mới |120/120 PASS, SHA freeze không đổi | `semantic-corpus-freeze.json`, `semantic-first-113-of-120.json`, `semantic-second-120-of-120.json`; deterministic preflight/anchors, không đo120LLM submissions |
| Main offline eval |146old+33V33+120V34 PASS | `semantic-eval-299.txt`; không bỏ IDs/case failures để đổi denominator |
| Corpus/property +auth/capacity |16/16 PASS,53,925s | `corpus-auth-capacity-16.txt` |
| Entity inspect +health |16/16 PASS,0,338s | `inspect-health-16.txt`; owned approved artifacts, composite/null keys, revision/field/input negatives, no SQL/provider |
| Security/health/inspect/provider |29/29 PASS,2,298s | `security-health-inspect-provider-29.txt`; includes revoke-during-fetch→403/no result publication |
| Provider faults/rolling observations/reliability |37/37 PASS,11,164s | `provider-fault-observation-37.txt`; no extra provider retry or paid probe |
| PostgreSQL ownership +epoch |8/8 PASS,0,231s | `ownership-epoch-postgres-8.txt`; fixture reader-group MVCC vector pin, concurrent generation change; not source completeness/cross-table atomicity |
| Pipeline |35pure +35realPG/MinIO/Kafka integration PASS at preceding checkpoint | `pipeline-integration-35.txt`, progress; fresh CI compose harness still pending; no real-source mutation/deployment |
| UI unit/type/build |170/170 PASS, typecheck/build PASS | `web-checkpoint-170.txt`, `web-checkpoint-typecheck.txt`, `web-checkpoint-build.txt` |
| Browser combined |24/24 PASS,42,5s | `browser-combined-24.txt`:12old mocked+8new mocked+4old HTTPfixture; four actual HTTP journeys use no page.route mocks; external provider0 |
| Architecture |81services/378edges/78staticreachable; largest SCC53 | `architecture-checkpoint.json`; baseline79/358/76/SCC60; import upper bound, not runtime call coverage |
| Metadata parity / whitespace |generated metadata `--check` +`git diff --check` PASS | same canonical23warehouse view definitions; API retains21/Sync23 consumers |

Suites overlap. Counts above must not be summed into a full backend/acceptance result. Earlier failed runs stay present: first semantic113/120, browser17/20, second browser fixture-heading failures, and ReactDOM VM-loader failure. Browser fixture was corrected to use production analysis_spec/prompt; no expected security/meaning assertions were removed.

## UX verification

Server-generated typed keys select exact groups from owned immutable result artifacts. Display labels do not define keys. Drawer reads no SQL/provider, checks report revision/artifact identity, preserves full-report totals, supports keyboard/focus/Escape, and uses a body portal for viewport layout. Synthetic/pivot/trend rows without a safe exact grouping key remain non-interactive. Desktop/mobile screenshots in `screenshots/` were visually inspected.

HTTP403 is a permission outcome: polling stops without connection retries, the pending submission key is removed, and the draft remains available. HTTP401 returns to login. Tokens/passwords are not persisted in localStorage/sessionStorage by the added auth flow.

## Outstanding work — do not mark COMPLETE

1. Finish reusable capability-rule parity and normalized reference-intent/compiler corpus coverage. New120 currently test input contracts/anchors; do not label them measured model accuracy or full120compiled intents.
2. Finish authorization across scoped BI routes/PII/lookups/resources/cache/oracle/export, policy revocation matrix and real deployment configuration. Several non-national legacy BI routes intentionally deny until safe adapters exist. Auth refresh still needs per-account draft preservation; inspect new-group analysis needs an explicit governed action.
3. Complete pipeline/metadata/DataHealth publication certificates, actual cadence/lateness/SLA/owner decisions and fresh CI fixture-harness execution. Unknown completeness must remain unknown. Canonical Gold/marts/Analyst metric parity still needs its full independent fixture matrix.
4. Complete request SQL-attempt/metadata accounting, provider cooldown concurrency/half-open tests, SQL/provider/job trace coverage, bounded per-principal admission, graceful shutdown/fault/load evidence. No sustained7day SLO or multi-instance readiness claim exists.
5. Migrations026/027/028 and limited login roles have been explicitly approved and applied. Actual reader snapshot, captured-intent warehouse execution and authenticated UI guided/save/DOCX now work. Complete the remaining role/resource/revocation and deployment gates; no non-admin business grants have been invented.
6. Frozen44/40 corpus and strict persistent-ledger runner are ready; user explicitly approved240TOTAL. Historical151events are preserved, authoritative ledger conservatively recovered to160 (4known manual transports+5uncertain reservations), leaving80. Full paid run is still NOT_RUN at this checkpoint; keep all failures and avoid a cherry-picked release.
7. Run final full integrated backend/eval/web/security/data/browser/served/load gates on one identified source/config/data revision, remote CI checks/branch admin policy, approved deployment and live acceptance. Keep skipped/incomparable/not_measured/incomplete truthful.

## Runtime and source preservation

- No commit/push/reset/restore/clean, no unrelated identity/chatbot/customer/K8s changes, no fact repair. Approved additive026/027+limited roles applied; same API container restarted, never recreated; ledger151 preserved.
- Temporary HTTP fixture `v33-followup-fixture` was stopped after24browser tests. Owned pipeline fixtures `v34-pipeline-postgres`, `v34-pipeline-minio`, `v34-pipeline-kafka` use a shared network-none namespace with no host ports; retained for diagnosis/continuation. They are separate from the application stack.
- `checkpoint-source-manifest.json` records file hashes/build outputs for this checkpoint. It is neither a committed revision nor evidence that served production matches these files. Historical run18 artifacts remain unchanged.
- Goal tracker reported `usageLimited` during continuation; project work remains IN_PROGRESS, not achieved or intentionally paused. Do not call `update_goal complete` from these subset results.

Latest snapshot repair/runtime/approval details: `runtime-snapshot-repair.json`, `snapshot-guards-deployed.json`, `api-postgres-ownership-metric-snapshot-20.txt`, `snapshot-readiness-audit-regression-82.txt`, `live-harness-offline-26.txt`, `web-final-175.txt`, `served-snapshot-web-identity.json`. Previous full backend1159PASS is retained; a newer full run is still in progress.

Latest continuation: operations+source reference and actual save/reopen issue are recorded in `findings-current-status.md` and progress doc. Ledger161/240 (79remaining), L03 diagnosticPASS1HTTP only. Reference120 now has83authored compiled intents+37terminal cases, not LLMaccuracy; metadata wording corrected/frozen anew without expected-case changes. Web177PASS,28mocked+4HTTPfixturePASS. Real policy-bound read-only warehouse artifact restore confirms full chart parity, donut totals440072000VND,0externalHTTP/0factwrites (`served-owned-artifact-replay.json`). Final full suite is still pending after this last product fix; no release approval.
