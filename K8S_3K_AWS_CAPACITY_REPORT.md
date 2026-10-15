# AWS 3K capacity qualification — kết quả ngày 14/10/2026

**3K NOT QUALIFIED. Maximum repeatably stable đã đo: 250 VU, được xác nhận bằng hai lượt normal độc lập.**
500 VU là mức đầu tiên FAIL latency với generator hợp lệ. Không chạy 1000–3000.
AWS đã cleanup; không còn owned active resources. Không suy ra application hard
ceiling 250 hoặc Supabase hard ceiling từ những phép đo này.

## Branch, source và môi trường

Worktree riêng: `/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI-k8s`; branch `features_k8s`.
Baseline `origin/main`: `9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b`.
Starting `features_k8s`: `978fabba45dd48bb2cc63419b0be8bd66ca492c9`.
Không merge, tạo PR, commit/push main hoặc branch_thaian.
RunId: `3k-aws-20261014T140730Z-e7a0d2`.

Application images ban đầu từ `da8ca6f74b04685f6b337630440184c70f5336bc`;
images cho quota experiment từ `dd98fd5a93a37fe45d0200fc8dc89bae2abecb0f`;
overlay rollback tại `23b2ed11`. Cả năm bộ filesystem layers giống hệt giữa hai
image revisions; source labels/image IDs khác, được công bố trong provenance.
Ghi đầy đủ source/Dockerfile/overlay/workload SHA, OCI/image/tar digests và import
verification trên cả ba target. Application code không đổi trong CPU experiment.

Target: 3 × m7i-flex.large, k3s server + 2 agents. Generator tăng 1 → 2 → 3 chỉ
sau measured inadequacy. Generator #3 được retire, replacement cho CPU experiment,
rồi retire sau rejection; 7 EC2 histories, tối đa 6 active cùng lúc. Final 250
confirmation dùng đúng topology 3 target + 2 generator đã có valid 250 PASS.
Native k6 2.3.0 được xác minh official checksum; images linux/amd64 và immutable.

Benchmark chỉ đi private IPv4 → NodePort 30300, ingress từ generator SG.
Không có public application ingress, Mac/tunnel/proxy trong benchmark data path.
Control dùng CMS encryption, pinned signatures và certificate được AWS console
xác thực. Không EKS/RDS/NAT/ElastiCache, plan upgrade hoặc IAM change.

Existing Supabase; `K8S_DB_MODE=existing`, `K8S_DEMO_READ_ONLY=true`.
Startup audit/tests xác nhận bỏ qua Menu migration, News seed/clear/view write,
Identity membership default save; TypeORM synchronize=false. Load chỉ bốn public
GET. Demo flag không thay thế SQL permission boundary; không destructive DB,
payment, checkout, order, wallet/voucher hoặc AI mutation.

## Pool idle hypothesis và before/after

Historical pool idle 5000 ms bằng cache TTL 5000 ms. Isolated diagnostic sau 7s
idle: pool5000 SELECT1 mất 1211/1269/1278 ms và tái tạo connection; pool30000 cold
1356 ms, warm194/194 ms và giữ connection. Thêm strict integer config
`DB_POOL_IDLE_TIMEOUT_MS`: default5000, bounds1000–60000; AWS experiment30000.
Pool max2/cache TTL5000 không đổi. Readiness connect timeout là biến độc lập:
default1000/AWS2000; query1000/probe4s giữ nguyên.

SAME250, 3 target/1 generator BEFORE: 19856 requests, 94.11 RPS, lỗi0%, checks100%,
p953536.66/hold3758.64/p994132.33 ms. AFTER: 41600 requests,195.92 RPS,
p95779.19/hold786.11/p991300.45 ms, lỗi0%, checks100%, restart0, smoke/recovery PASS.
Nhưng AFTER là **INVALID GENERATOR**: CPU peak98%, 14 samples liên tiếp >=90%.
Không dùng nó để qualification. Hai generator sau đó cho 250 STABLE PASS.
**Giữ bounded pool option/AWS30000; default ngoài AWS vẫn5000. Không claim fix3K.**

## First failure và quota experiment

500/two generators INVALID: generator#1 CPU94.61%, 4 samples liên tiếp >=90%.
500/three generators hợp lệ nhưng holdp952233.52 ms FAIL; restart0, HPA hợp lệ,
smoke/recovery PASS. Gateway CPU peak194–286m so với limit500m; không có bằng chứng
node capacity/scheduling pressure để tăng node hoặc HPA.

Diagnostic ghi một Gateway có peak31.2% throttled periods, 0.914s throttled/5s.
Thử một biến chính: AWS Gateway CPU limit500→750m; request/HPA giữ nguyên.
Normal500 có một short STABLE PASS, nhưng long500 FAIL:
p951841.97/hold2421.21/p997112.91 ms, generator hợp lệ, restart0.
**Bác bỏ experiment, rollback750→500m. Không giữ lucky short PASS làm500qualification.**

## Workload, gates và tất cả meaningful runs

Workload SHA256: `dfb9af16b94cc0b22ae53710ece3bde446831fb110a928e7573120bf3ffc4c83`.
Bốn GET tuần tự: `/menu/danh-muc`, `/menu/san-pham`, `/users/branches/public`,
`/news?limit=100`; full JSON/every item/gzip, think3s. Normal60/120/30+15;
long60/300/60+15. Whole và hold p95<1500ms, failure<2%, checks>98%.
Stable còn cần không overload restart/OOM/CrashLoop/node pressure, HPA hợp lệ,
mọi generator đủ CPU/RAM/FD/socket/ENA/coverage, post-smoke và natural recovery2/1/1.

Private baseline 80 requests PASS ở các stage bắt buộc; cold tails được giữ lại.
Payload counts23/118/1215/3; branches718448 decoded/80793 gzip bytes.
Không DTO/pagination/TTL/JSON-validation bypass. Percentile gộp từ actual observations,
không averagep95; kiểm tra request/check count completeness và start skew<=2s.

| Run | VU | Hold (s) | Requests | RPS | Lỗi (%) | Checks (%) | p95 (ms) | Hold p95 (ms) | p99 (ms) | Kết quả |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| [diagnostic-fixed-g2-500](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/diagnostic-fixed-g2-500/analysis.json) | 500 | 120 | 76904 | 361.78 | 0.0676 | 99.9324 | 1052.63 | 1151.95 | 4063.37 | DIAGNOSTIC (NOT QUALIFICATION) |
| [diagnostic-g3-500](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/diagnostic-g3-500/analysis.json) | 500 | 120 | 75512 | 352.84 | 0.0172 | 99.9828 | 1713.43 | 1878.42 | 5691.24 | DIAGNOSTIC (NOT QUALIFICATION) |
| [gateway-750/gateway750-g3-500](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/gateway-750/gateway750-g3-500/analysis.json) | 500 | 120 | 75972 | 354.98 | 0.3199 | 99.6801 | 1186.07 | 1343.96 | 6580.69 | STABLE PASS |
| [gateway-750/gateway750-long1-500](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/gateway-750/gateway750-long1-500/analysis.json) | 500 | 300 | 156920 | 370.90 | 0.2568 | 99.7432 | 1841.97 | 2421.21 | 7112.91 | FAIL |
| [pool30-250](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/pool30-250/analysis.json) | 250 | 120 | 41600 | 195.92 | 0.0000 | 100.0000 | 779.19 | 786.11 | 1300.45 | INVALID GENERATOR |
| [pool30-final/confirm-pool30-g2-250](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/pool30-final/confirm-pool30-g2-250/analysis.json) | 250 | 120 | 48388 | 227.07 | 0.0000 | 100.0000 | 575.40 | 584.29 | 1145.62 | STABLE PASS |
| [pool30-g2-250](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/pool30-g2-250/analysis.json) | 250 | 120 | 47636 | 223.64 | 0.0000 | 100.0000 | 659.20 | 640.11 | 1194.15 | STABLE PASS |
| [pool30-g2-500](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/pool30-g2-500/analysis.json) | 500 | 120 | 76216 | 357.11 | 0.0000 | 100.0000 | 1233.29 | 1325.20 | 2857.14 | INVALID GENERATOR |
| [pool30-g3-500](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/pool30-g3-500/analysis.json) | 500 | 120 | 77848 | 364.84 | 0.0090 | 99.9910 | 1356.48 | 2233.52 | 5023.18 | FAIL |


Valid250 lần đầu: 47636 requests,223.64 RPS, p95659.20/hold640.11ms, lỗi0%, checks100%.
Final confirmation: 48388 requests,227.07 RPS,
p95575.40/hold584.29/p991145.62ms,
lỗi0.0000%, checks100.0000%:
**STABLE PASS**. Cùng app filesystem/config/resources/HPA/profile/topology;
image metadata labels khác. 250 VU, được xác nhận bằng hai lượt normal độc lập. Đây là normal qualification, không endurance nhiều giờ.
3000 normal/long#1/long#2 đều NOT RUN. **3K QUALIFIED: NO.**

## Bottleneck và giới hạn kết luận

500 valid FAIL có route holdp95 khoảng1.94–2.51s trên cả bốn route;
waiting holdp95~2221ms, receiving~67.6ms, connecting~84.1ms. Generator/node/scheduler
không saturation trong valid FAIL. Kernel diagnostic: ENA quota/listen overflow
deltas0, CPU steal peak~0.1%; server có một TCP timeout/SYN retransmit.
Quota750 không tạo repeatability, nên chưa chứng minh CPU quota là primary cause.

Corrected isolated SQL probes:72 samples/service, một connection được giữ,
SELECT1p95~168–180ms, không SQL errors. Pod loopback warm GET nhanh; branch cold/tail
~1.2–2.5s, Menu~0.8–1.85s. Observed limit là request waiting/cache-miss/business-query/
upstream tail (**F/I, G/E chưa tách hoàn toàn**). Scalar SQL không phải actual route
query profiling; không kết luận Supabase hard ceiling. Một probe attempt lỗi Node20
stdin name shadowing có zero SQL samples, không được dùng; đã sửa và regression
exact invocation. Mọi diagnostic runs đều NOT QUALIFICATION.

Shared DB không phải isolated snapshot; synthetic public browse không mô phỏng
browser assets/rendering/checkout/payment/AI hoặc node HA. Numeric points được
compact losslessly cho exact merge, giữ original raw hashes; không business bodies/secrets.

## Regression, cost, cleanup và bước tiếp

Final regression: Identity58/Menu43/News32/Gateway20, K8S24, AWS41 (40 PASS +1
historical skip): **217 PASS +1 SKIP**. Backend builds PASS; AWS14/local22 resource
renders PASS; diff check/secret review PASS. Không deploy Docker Desktop hoặc sửa
application working tree của user.

Projected ceiling$3.6187. Estimated compute/EBS/publicIPv4 runtime upper bound:
**$1.9076**, chưa itemize transfer;
không phải actual bill/credit balance. EBS rate là assumption chưa revalidate;
transfer reserve$0.75, conservative total vẫn<$5. Chi tiết per-instance ở
[runtime-cost.json](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/runtime-cost.json).

Final cleanup 2026-10-14T16:53:00.094344+00:00: owned active/stopped EC2=0, SG=0, EBS=0,
keypairs=0; registry/benchmark/control endpoints0 sau local control cleanup.
Terminated histories được phép. [Cleanup](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/final-cleanup.json).

Next unresolved action: instrument actual cache miss/business query và Gateway
upstream/event-loop timing tại500. Một primary variable, same-load rerun; không
1000+ trước repeatable valid500PASS. Fresh fleet cần RunId/cost/eligibility/provenance
mới; reestimate remaining$5 budget trước khi tạo. User tự final merge.
[Qualification](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/qualification.json), [historical paused report](k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/historical-K8S_3K_AWS_CAPACITY_REPORT.md).

## Resume checkpoint — 15/10/2026, paused by user

Reused the clean dedicated features_k8s worktree at starting SHA `063efc4990d664d7a2e3843fb3ce87fa6126be48`.
Fetched origin; main baseline is still `9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b`, an ancestor.
AWS ownership inventory returned EC2/SG/EBS/keypairs all zero. No resource creation,
control endpoint, image build/deployment or benchmark occurred before the user paused.
Incremental resource cost estimate for this resume: $0; not an invoice statement.

Added disabled-by-default, fixed-size 30-second route/cache/DB/event-loop/upstream
instrumentation and per-route k6 TTFB trends. See FEATURES_K8S_RESUME.md for exact
semantics and measurement limitations. This is preparatory instrumentation, not a
performance fix. Its capacity overhead still requires measurement; do not use it as
proof of the 500 VU root cause. Historical 250/500 results and rejected 750m experiment
remain unchanged. 1000–3000 and both long 3K qualifications remain NOT RUN.
No merge/main/branch_thaian modification. Checkpoint committed/pushed on features_k8s.

Checkpoint validation: **228 PASS + 1 historical SKIP**; all four backend builds PASS;
local 22-resource semantic render PASS; AWS template render PASS (14 resources).
`git diff --check` and staged secret review PASS. No diagnostic overhead/load
validation performed. Evidence: `k8s/verification/3k-aws-capacity/resume-20261015-instrumentation/checkpoint.json`.
