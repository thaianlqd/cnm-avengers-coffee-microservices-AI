# AWS Kubernetes capacity — kết quả hoàn tất phase ngày 16/10/2026

**3000 VU: NOT VALID / NOT QUALIFIED; không chạy sau lower-level failure.**
Mức đã có bằng chứng lặp lại được giữ ở **250 VU** (hai normal PASS lịch sử;
regression 250 mới cũng PASS). **375 VU là highest fresh single normal PASS**,
đã giữ120s, chưa chạy long/repeat; không nâng nó thành repeatably qualified.
500 short PASS nhưng long500 FAIL; không giữ lucky short PASS làm500 qualification.
First unstable default level mới: **500 VU ở long profile**. Đây không phải exact
application hard ceiling: thời lượng khác nhau và long500 còn thiếu resource coverage.

Phiên runtime bị gián đoạn sau khi375 normal đã hoàn tất. Guest termination guard
đã giới hạn tuổi máy; lúc khôi phục không còn instance/EBS/keypair, còn hai owned SG.
Đã cleanup hai SG và xác minh toàn bộ AWS. Không provision fleet thứ ba, không
chạy lại workload hoặc gọi375 long/3K là PASS. Phase đo có giới hạn đã kết thúc;
higher/long qualification còn là công việc riêng, không được suy ra từ báo cáo này.

## Source, topology và DataPlatform

Branch `features_k8s`, isolated worktree `cnm-avengers-coffee-microservices-AI-k8s`.
Starting HEAD/application source `d715ba7423d012e068eb5b447b806c9a4967320b`;
origin/main được fetch ở `9ab6d638d72f55e8b5c0208a692b5b6252a7a861`. Không merge.
Không sửa/stash/reset/clean/switch worktree `branch_thaian`; không dừng Compose,
restart Docker Desktop, bật local Kubernetes hoặc đổi CPU/RAM trên Mac đang chạy
DataPlatform/Claude. **Local runtime NOT RUN**; local static PASS là kết quả riêng.

Ba target (k3s server + hai agents) và tối đa ba generator, mỗi máy
m7i-flex.large /2vCPU/8GiB, Ubuntu24.04 amd64, `ap-southeast-2`, native k6 2.3.0
với official checksum. Generator2/3 chỉ thêm theo measured inadequacy lịch sử có
SHA trong generator*-inadequacy.json và explicit user approval. Tối đa sáu máy active;
không upgrade instance/plan/IAM. Application images immutable
`avengers/<service>:3k-aws-d715ba7423d0`; năm images amd64, tar/image/import hashes
được giữ trong build-checks/source-manifest/target*-image-import.

Data path: generator private IPv4 → target1 private NodePort30300 → Gateway →
backend thật. Baseline từ mỗi generator80 requests PASS, tổng240. Không Mac,
localhost, reverse SSH hoặc Cloudflare trên data path. Cloudflare chỉ làm HTTPS
control; commands/results được CMS encrypt/sign và recipient cert đối chiếu AWS
console. SG không có public application ingress; NodePort chỉ nhận generator SG.

User cho phép đúng DB host/port/user/password/database/schema/TLS hiện có vào ba
AWS target tạm account956035085549 ở vùng trên. Không in/commit credentials; không
chuyển real payment/email/auth secrets. Startup JWT/INTERNAL/VNPAY placeholders
sinh riêng trên AWS. Existing Supabase/Postgres TLS, không reset/migrate/seed/restore
DB; read-only transaction audit năm schema PASS. `K8S_DEMO_READ_ONLY=true` là startup
mode, không phải SQL permission boundary của cả platform. Workload chỉ bốn GET.

Không đổi application/business logic, payload, TTL, pool size, resources/probes/HPA
hoặc transport. Giữ Gateway500m/request75m; backend400m; HPA G/I/M2–4/1–3/1–4;
cache5000ms, poolmax2, AWSidle30000ms (default ngoài AWS5000), keepalivefalse,
maxRequestsPerSocket0. Diagnostics bật riêng rồi trả false trước default runs.
750m experiment lịch sử vẫn bị bác bỏ. Snapshot retained-runtime là cấu hình trước
các default runs; không giả lập final runtime capture sau khi máy đã bị hủy.

## Workload và gates

Workload SHA256 `8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.
Bốn GET tuần tự: `/menu/danh-muc`, `/menu/san-pham`, `/users/branches/public`,
`/news?limit=100`; full JSON/every-item validation/gzip, think3s. Counts23/118/1215/3;
branches718448 decoded/80793 gzip bytes. Không pagination/DTO/validation bypass.
Normal60/120/30 + grace15; long60/300/60 + grace15. VU gồm think time, không phải RPS.

Whole AND hold: failure<2%, checks>98%, p95<1500ms. Stable còn cần generator đủ
CPU/RAM/FD/socket/ENA, coverage và actual VU timeline (>=95% hold samples ở target);
đủ HPA/Pod/node metrics trong hold; không restart/OOM/node pressure; post-smoke và
natural recovery G/I/M2/1/1. Không manual scale-down để tạo recovery PASS.
Mức500 phải repeat/long PASS trước1000+ theo checkpoint hiện có.

| Point | VU | Hold s | Requests | RPS | Lỗi % | Checks % | p50 ms | p90 ms | p95 ms | Hold p95 ms | p99 ms | Max ms | Kết quả |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| [diagoff-a-250](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/diagoff-a-250/analysis.json) | 250 | 120 | 48896 | 229.10 | 0.00 | 100.00 | 12.17 | 158.59 | 595.00 | 565.46 | 1066.41 | 2340.85 | STABLE PASS |
| [diagon-a-250](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/diagon-a-250/analysis.json) | 250 | 120 | 47760 | 222.84 | 0.00 | 100.00 | 19.27 | 199.18 | 614.13 | 587.90 | 1169.64 | 2351.87 | DIAGNOSTIC (NOT QUALIFICATION) / STABLE PASS |
| [diagon-g3-500-retry](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/diagon-g3-500-retry/analysis.json) | 500 | 120 | 70420 | 330.82 | 0.43 | 99.57 | 49.47 | 897.70 | 1908.02 | 2711.17 | 7613.13 | 10076.59 | DIAGNOSTIC (NOT QUALIFICATION) / FAIL |
| [default-g3-500](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/default-g3-500/analysis.json) | 500 | 120 | 76500 | 358.19 | 0.60 | 99.40 | 36.55 | 511.24 | 1117.13 | 1334.36 | 8504.31 | 10130.81 | STABLE PASS |
| [default-long-g3-500](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/default-long-g3-500/analysis.json) | 500 | 300 | 137269 | 315.57 | 2.21 | 97.79 | 36.39 | 1032.17 | 3363.87 | 3376.06 | 10000.19 | 10143.67 | FAIL |
| [default-g3-375](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/default-g3-375/analysis.json) | 375 | 120 | 70636 | 331.68 | 0.00 | 100.00 | 20.36 | 210.41 | 693.40 | 563.58 | 1353.28 | 5735.68 | STABLE PASS |

250: PASS regression; 500: FAIL qualification (long). 1000/1500/2000/2500/3000:
NOT RUN.375: single normal PASS, repeat/long NOT RUN. Diagnostic rows không đủ tư
cách qualification dù observed gates PASS. Không average percentiles; merged
quantiles dùng toàn bộ actual numeric observations và kiểm tra count/start skew.

Long500: generator hợp lệ, lỗi2.2081%/checks97.7919%, latency FAIL, hai original
post-smoke FAIL. HPA recovery PASS. Tám hold observations có node metrics thiếu:
52/60 complete samples nhưng maxgap42.634s >15s nên coverage FAIL. Không thay unknown
bằng zero hoặc bỏ failed requests. Không thể tái dựng đầy đủ tài nguyên trong gap;
HTTP failure độc lập vẫn có đủ raw numeric evidence. Không coi đây là exact DB ceiling.

## HPA, tài nguyên, VU và transport

G/I/M HPA peak4/3/4. Mọi completed point restart delta0; không thấy OOMKilled,
CrashLoop hoặc node pressure trong Pod/node status observations. Từng Pod UID và
metric nằm trong target.jsonl.gz/analysis.json; VU thực và fraction ở target được
kiểm tra độc lập cho từng generator. Start skew tất cả đều <2s.

| Point | Complete-cluster peak CPU m | RAM MiB | Generator CPU peak | Complete hold samples | Max complete gap | Restart delta |
|---|---:|---:|---:|---:|---:|---:|
| diagoff-a-250 | 1378 | 2136 | 59.82% | 24/24 | 5.00s | 0 |
| diagon-a-250 | 1420 | 2163 | 60.76% | 24/24 | 5.00s | 0 |
| diagon-g3-500-retry | 2087 | 2193 | 74.05% | 24/24 | 5.00s | 0 |
| default-g3-500 | 2164 | 2217 | 78.76% | 24/24 | 5.00s | 0 |
| default-long-g3-500 | 2011 | 2356 | 77.52% | 52/60 | 42.63s | 0 |
| default-g3-375 | 1709 | 2349 | 61.22% | 24/24 | 5.00s | 0 |

Các peak dưới đây là maxima riêng từng đại lượng trên cửa sổ load/recovery, không
nhất thiết cùng timestamp/Pod. Không cộng maxima từng node để suy ra cluster peak.
Metric thiếu bị bỏ khỏi peak calculation, giữ null/blank khi không có complete sum.

| Node / highest observed single Pod by service | CPU m | RAM MiB |
|---|---:|---:|
| capacity-target1 | 1489 | 1114 |
| capacity-target2 | 814 | 749 |
| capacity-target3 | 492 | 737 |
| api-gateway | 287 | 44 |
| identity-service | 143 | 61 |
| menu-service | 159 | 65 |
| news-service | 106 | 45 |

Generator CPU peak lớn nhất trong các completed points 78.76%,
không ba intervals liên tiếp>=90%; RAM/FD/socket/ENA gates PASS. Đây chỉ là tính hợp
lệ ở250/375/500, không chứng minh ba generator đủ cho3000. Per-generator CPU/RSS/FD/
RAM/ENA và actual VU peaks trong session-results.json. Không thấy FD/socket exhaustion
signature; có request timeouts/status0 và HTTP500 như dưới, không xóa khỏi thống kê.
Host TCP counters không bao phủ Pod network namespaces nên không loại trừ transport.

| Point | Status counts (0 = không nhận HTTP status) |
|---|---|
| diagoff-a-250 | {"200": 48896} |
| diagon-a-250 | {"200": 47760} |
| diagon-g3-500-retry | {"0": 301, "200": 70114, "500": 5} |
| default-g3-500 | {"0": 458, "200": 76041, "500": 1} |
| default-long-g3-500 | {"0": 3024, "200": 134238, "500": 7} |
| default-g3-375 | {"200": 70636} |

correlation.csv join window5s với observed VUs, lỗi/checks, HPA current/desired,
Pod/node CPU/RAM và generator CPU/RAM/RSS/FD. CSV p95 là per-generator/per-route;
không phải global quantile được average. Tổng requests trong CSV khớp100% root k6
cho từng point. Compact metric-points giữ exact numeric samples, stage-vus giữ
actual timestamps; lớn raw originals ở ngoài Git trên ephemeral AWS disks.

## Diagnostics và bottleneck còn chưa chứng minh

SAME250 off→on: p95595.00→614.13ms (+3.2%); RPS229.10→222.84 (-2.7%). Chỉ một pair,
không chứng minh zero overhead hoặc nhân quả; overhead có thể khác ở500. Diagnostic500
FAIL khác với default short500 PASS; không dùng diagnostic result thay qualification.

Trong34 complete diagnostic30s windows nằm trọn hold500: Identity branches
acquiremean0.19ms/max1.34ms, querymean1078ms/max1494ms, loadmean1106ms. Query timing gồm
wire/server/row decoding, chưa tách SQL execution ở DB server. Menu products loadmean738ms;
cold physical connects~1054ms. News querymean169ms/load171ms, requestmean5.1ms/max207ms
trong selected hold windows; Gateway upstream News mean232ms/max9893ms. Lifetime News
request max1376ms khác hold-window max207ms. Đây là surviving-Pod aggregates, không
request-ID pairing; Gateway spans bắt đầu sau socket assignment nên chưa đo queue/
connect trước đó. Không chạy SQL EXPLAIN/business-query plan ở phase này.

Diagnostic kernel/cgroup có Gateway500m peak~47.8% throttled periods,1.317s/5s;
backend400m~10–22%. Có burst/throttle evidence nhưng không đủ để tăng quota:750m
lịch sử đã không qua long500. ENA allowance deltas0 ở target/generator, không loại
trừ Pod transport. Các điểm chờ Gateway/upstream, cache-refresh/DB latency và
metrics-server gap cần tách tiếp; chưa chứng minh một root cause duy nhất. Generator
không phải bottleneck trong các lượt mới. Không đủ dữ liệu để khẳng định node hoặc
DB hard ceiling. Giữ nguyên cấu hình, không retry random hoặc bật keepalive blind.

Bước tiếp theo nếu mở phase mới: confirm375 với cùng normal+long, đo socket assignment/
DNS/connect/upstream timing cùng request với backend/cache/DB và server-side query
work, kiểm tra metrics-server reachability trong failure window. Chỉ sau bằng chứng
mới thử một biến, lower regression rồi failed normal+long. Không1000+ trước repeatable500.

## Regression và setup failures

**245 tests PASS +1 historical skip:** backend161 trên AWS (Gateway22/Identity60/
Menu45/News34), AWS Python57, K8S Python24, Node control/security3. Build năm images
PASS trên AWS. Không build backend nặng trên Mac. Static local22 resources/tám
services và AWS14 resources/bốn browse services PASS; immutable runtime tag validation
đã PASS. Không nâng local runtime thành PASS: local Kubernetes disabled, NOT RUN.

AWS baseline/browse smoke PASS; failed post-smoke của long500 vẫn là FAIL trong bảng.
Gateway Pod self-healing và same-image rolling restart mỗi lượt60/60 HTTP200 trên
categories, replacement UID được xác nhận và baseline phục hồi. Không claim versioned
deployment, node/controlplane HA hoặc runtime đủ tám services. Socket.IO NOT RUN
hiện tại; historical synthetic PASS giữ riêng, không claim horizontal Order scaling.

Setup-only run `3k-aws-20261016T050136Z-1eaf34` đã build/test nhưng chưa deploy DB/load;
FINISH được gửi trước khi DB approval tới, cleanup PASS rồi mới mở fresh fleet.
`diagon-g3-500` đầu chưa chạy k6 vì sampler thiếu directory; dừng owned sampler, sửa
mkdir và retry cùng fleet. Không gọi các setup failures là application capacity FAIL.
Hai thiếu export long500 do shell errexit khi failed smoke đã được thu hồi từ original
raw, không rerun workload. Analyzer được sửa cho observed `<unknown>` và có regression tests;
final lightweight status/resource reanalysis giữ nguyên toàn bộ HTTP quantiles/counts.

## Cleanup, cost và delivery

Cleanup API PASS tại `2026-10-16T09:58:49.299468+00:00` (16:58 giờ Việt Nam): cả ba known phases,
tất cả RunIds, nonterminated/stopped instances0, SG0, EBS0, keypairs0, ENIs0.
Local control listener/processes absent, private control folder absent. Original
controller exit không quan sát được; không claim finally tự chạy. Guest guard giới
hạn compute nhưng còn orphan SG sau interruption, đã ownership-scoped cleanup thủ công.
Không đổi unrelated AWS resources, IAM; không tạo EKS/RDS/NAT/EIP/keypairs.

Official Sydney m7i-flex.large price0.1197USD/h, SKU YZS4YR3ZPHD427K5, observed16/10,
effective01/10; Pricing API deny nên dùng official public CSV, không đổi IAM.
Configured150min × max6 machines: compute1.7955 + EBS.10 + IPv4.09 + transfer/
contingency.75 =2.7355USD; cộng old estimate1.9076 và setup reserve.30 =4.9431USD.
Đây là planned conservative reservation, không hóa đơn. Actual termination timestamps
không còn từ describe-instances khi recovery; không bịa actual runtime/cost. Không
mở thêm fleet sau interruption. [Cleanup/cost/source evidence](k8s/verification/3k-aws-capacity/3k-aws-20261016T051947Z-e45239/README.md).

Chỉ helpers AWS/capacity/tests/docs/evidence thay đổi; không application source hoặc
Kubernetes resource semantics. Commit/push chỉ `origin/features_k8s`, không merge.
Exact delivery HEAD được trả ở kết quả Git/final response, không phải image source SHA.

## Câu dùng an toàn trong luận văn

"Trên cluster AWS ba node, workload public browse bốn GET với full JSON validation
đạt một plateau375 VU trong120 giây,0% lỗi, p95693.40ms và331.68req/s. Mức có bằng
chứng lặp lại được giữ ở250 VU.500 VU không qua xác nhận dài300 giây;3000 VU chưa
được qualification. Kết quả không đại diện checkout/payment/auth writes/order/AI,
assets/browser rendering hoặc3000 người dùng production."

---
# Historical report — 14/10/2026 (giữ nguyên số liệu, không phải kết quả mới)

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
No merge/main/branch_thaian modification. Checkpoint committed on features_k8s. Initial push failed authentication; user then
authorized GitHub CLI via browser as thaianlqd. Push succeeded and remote SHA was
verified at 4ebb424730f02a64f0772c59b6c373f8118734ee. Phase remains paused.

Checkpoint validation: **228 PASS + 1 historical SKIP**; all four backend builds PASS;
local 22-resource semantic render PASS; AWS template render PASS (14 resources).
`git diff --check` and staged secret review PASS. No diagnostic overhead/load
validation performed. Evidence: `k8s/verification/3k-aws-capacity/resume-20261015-instrumentation/checkpoint.json`.
