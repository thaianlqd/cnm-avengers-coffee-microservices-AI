# Kết thúc bounded AWS qualification — 16/10/2026

Branch `features_k8s`, isolated `-k8s` worktree; starting/application HEAD
`d715ba7423d012e068eb5b447b806c9a4967320b`. Không merge hoặc đụng worktree DataPlatform
`branch_thaian`, Compose hay Docker Desktop. User đã resume và cho phép<=3 generator
khi có measured inadequacy, cùng DB-only config egress tới ba AWS target account956035085549,
ap-southeast-2 qua encrypted authenticated control; các paused instructions lịch sử bên
dưới đã được supersede bởi lần resume này. Không còn phase đang chạy.

3K NOT VALID/NOT QUALIFIED;1000–3000 NOT RUN. Retained repeatable qualification250VU;
fresh250 regressionPASS. Highest fresh single normal375VU PASS120s:70636requests,
331.68RPS,0%fail/checks100%,p95693.40/hold563.58/p991353.28ms.375repeat/long NOT RUN
vì runtime bị gián đoạn.500 shortPASS nhưng longFAIL:137269requests,315.57RPS,
2.2081%fail/checks97.7919%,p953363.87/hold3376.06/p9910000.19ms. Generator hợp lệ,
restart0; hai failed smoke, resource maxgap42.634s được giữ nguyên. Không claim375
repeatable hoặc exact application/DB ceiling.

Diagnostics đã được load-validated riêng250/500 và trả false. Chỉ một off/on250pair,
không zero-overhead claim. Không đổi app code/resources/HPA/TTL/pool/transport;
retained Gateway500m, poolidleAWS30000(default5000), cache5000, keepalivefalse.
Helpers harden lifecycle/inventory/approved extra generators/SIGTERM/truthful cleanup,
actual VUs/complete metrics, unknown-as-missing, exactp90/5s route windows. Tests245PASS
+1skip; local22/AWS14 staticPASS. AWS Gateway self-heal/rolling restart60/60HTTP200
mỗi lượt. Local runtime/Socket.IO NOT RUN hiện tại; historical PASS giữ riêng.

AWS cleanup PASS verified `2026-10-16T09:58:49.299468+00:00`: all known phases/RunIds instance0,
SG0,EBS0,keypairs0,ENIs0. Guests đã hết, hai orphan SG được cleanup sau interruption;
control/process/privatefolder absent. Không provision fleet mới khi resume recovery.
Budget planned combined4.9431USD, actual bill/termination timestamps chưa xác minh;
không bịa runtime actual. Source/build/compact exact samples/stage/HPA/Pod/node/
generator/CSV/cleanup có trong [evidence](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/README.md).

[Latest full report](K8S_3K_AWS_CAPACITY_REPORT.md). Nếu có phase mới: fresh price/budget
và clean inventory, confirm375normal+long trước; đo Gateway socket/DNS/connect cùng
backend/cache/DB và metrics-server gap trước tuning một biến. Không1000+ trước500
repeatably validPASS. Giữ permissions/budget scope, không tự provision từ historical
commands. Delivery commit dùng `git log -1`; chỉ push origin/features_k8s, không merge.

---
Historical handoff (không phải active pause):

# Paused by user — 15/10/2026

Instrumentation checkpoint: `89539f671748dba9befaceb61b21f28bb0727ee3`.
GitHub authentication restored via browser device flow as `thaianlqd`.
Push verified: origin/features_k8s reached `4ebb424730f02a64f0772c59b6c373f8118734ee`.
This follow-up documentation commit records the resolved delivery blocker; current
checkpoint SHA is `git log -1`. Phase remains paused by user.
Do not provision AWS while paused.

User requested stopping the resumed phase and committing/pushing the current checkpoint.
No AWS resources were provisioned and no new benchmark was run in this resume.
Branch/worktree: `features_k8s` in the dedicated `-k8s` worktree below.
Starting/current pre-checkpoint SHA: `063efc4990d664d7a2e3843fb3ce87fa6126be48`;
checkpoint SHA: see `git log -1` (this document is committed with the instrumentation).
Verified remote main baseline: `9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b`.
Fetch succeeded; features local == remote, main is an ancestor. No merge needed.

Added opt-in `CAPACITY_DIAGNOSTICS=true` instrumentation to Gateway/Identity/Menu/News:
fixed public-route aggregates every 30 seconds, event-loop histogram, Gateway upstream
headers/body timing, cache hit/refresh/coalescing/wait/load/JSON/gzip,
DB pool acquire, physical connect, and pg promise-query timing. No SQL/parameters,
bodies, headers, credentials or PII logged. Diagnostics are disabled by default;
AWS overlay does not enable them automatically. Cache TTL/pool/resources unchanged.
Query timing includes wire/server/row decoding; acquire can include physical connect.
No isolated server SQL execution or row materialization measurement yet. Gateway spans start at proxyReq (after socket assignment); socket queue/connect
time is not measured by this checkpoint. Byte metrics use sums/max; time buckets are not
meaningful for byte counters. Histograms are fixed buckets, not exact percentiles.
The k6 profile now also records per-route waiting/TTFB trends; workload SHA changed,
so record fresh provenance before the next run. HTTP/check tags and thresholds unchanged.

**Instrumentation is unit/build checked, NOT validated under capacity load.**
No bottleneck claim, tuning result, overhead claim or new qualification follows from it.
Next exact action after resume: inspect checkpoint; measure diagnostic overhead; collect
fresh prices/budget/source provenance and fresh RunId before provisioning; deploy this
instrumentation and run SAME 500 VU with adequate generators. Separate route/cache/DB/
upstream timing before one-variable tuning. No 1000+ before repeatable valid 500 PASS.

AWS preflight inventory 2026-10-15: 0 owned EC2 (including stopped), 0 SG, 0 EBS,
0 keypairs using all four ownership tags across RunIds. No new control/benchmark
endpoint was started. Incremental AWS resource usage in this resume: zero.
Maximum repeatably stable remains 250 VU; first valid failure remains 500 VU.
750m Gateway experiment remains rejected; final retained limit 500m.
Main and branch_thaian untouched. User handles any merge.

---
Historical handoff (preserved):

# FEATURES_K8S — AWS qualification handoff, 14/10/2026

**Experiment hiện tại đã kết thúc và AWS sạch. 3K NOT QUALIFIED.**
Maximum repeatably stable đã đo: 250 VU, được xác nhận bằng hai lượt normal độc lập.
500 valid FAIL latency; không chạy1000–3000. Higher qualification vẫn còn dở.

Worktree riêng: `/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI-k8s`, branch `features_k8s`; tự reuse, bảo vệ `branch_thaian`.
Baseorigin/main: `9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b`.
Startingfeatures: `978fabba45dd48bb2cc63419b0be8bd66ca492c9`.
Không merge/PR/main/branch_thaian writes. Checkpoints đã push; final docs SHA xem gitlog.

Đọc `K8S_3K_AWS_CAPACITY_REPORT.md` và `k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/qualification.json` trước.
Pool idle default5000/AWS30000 (bounds1000–60000) được giữ; maxpool2/cacheTTL5000.
Probe connect default1000/AWS2000 độc lập. CPU750 experiment bị bác bỏ sau long500
FAIL và đã rollback Gateway500m/request75m/HPA2–4; backend resources/HPA không đổi.
Final250 confirmation STABLE PASS: p95575.40/hold584.29ms.
Images source `dd98fd5a`, filesystem giống `da8ca6f7`; overlay rollback `23b2ed11`.
Giữ mọi INVALID GENERATOR/FAIL/diagnostic helper failure. Không claim500qualification,
application ceiling250 hoặc Supabase hard ceiling.

Next: instrument actual cache miss/business query và Gateway upstream/event-loop
at500; measured tuning, same-load rerun. Không TTL/payload/validation benchmark bypass,
không1000+ trước repeatable valid500PASS. Fresh fleet phải dùng RunId/cost/eligibility/
provenance mới, không reuse oldIPs/certificates/tokens.
Run `3k-aws-20261014T140730Z-e7a0d2` đã cleanup: zero owned active resources, endpoint/control đã dừng.
Estimated incremental compute/EBS/IPv4 $1.9076,
chưa itemize transfer/notactualbill. Hard phase budget$5: reestimate trước khi tiếp tục.
Target<=4/generators<=3; không EKS/RDS/NAT/planupgrade/IAM/destructiveDB/publicappports.
User tự final merge. Historical handoff giữ trong evidence và Git history.

Checkpoint validation: **228 PASS + 1 historical SKIP**; all four backend builds PASS;
local 22-resource semantic render PASS; AWS template render PASS (14 resources).
`git diff --check` and staged secret review PASS. No diagnostic overhead/load
validation performed. Evidence: `k8s/verification/3k-aws-capacity/resume-20261015-instrumentation/checkpoint.json`.
