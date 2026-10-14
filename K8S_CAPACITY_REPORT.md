# Capacity qualification — Avengers Coffee Kubernetes local

Đo ngày 13–14/10/2026 (Asia/Ho_Chi_Minh; artifact dùng UTC). Kết quả chỉ áp dụng
cho public browse GET trên cấu hình local và dữ liệu tại thời điểm đo. Evidence
ghi riêng từng lượt, gồm cả thất bại, aborted và environment overlap.

**Kết quả cuối: 250 concurrent VUs public browse, hai lượt STABLE PASS**, tổng
99.192 request, 0 lỗi, p95 từng lượt 488,5 / 415,0ms. Mức 500 không lặp lại ổn
định; 1.000 không đạt. Giới hạn này áp dụng cho HTTP không nén trên shared host
local, không phải capacity độc lập của ứng dụng trong production.

## 1. Test objective

Tìm mức concurrent virtual users ổn định, dừng ở mức đầu tiên thất bại rồi thu
hẹp khoảng 250–500 VU; không ép 5.000 PASS. Mức cuối cần hai lượt cùng cấu hình
đạt HTTP thresholds, không restart mới, metrics hợp lệ, phục hồi tự nhiên và
smoke PASS. VU là client có think time, không phải số request đang xử lý đồng
thời hoặc người dùng thực hiện mọi nghiệp vụ.

## 2. Hardware/environment

Mac Apple Silicon, 8 CPU logical, RAM vật lý 16 GB; Docker Desktop arm64 một
node, 8 CPU, capacity memory 8.319.770.624 bytes (xấp xỉ 8 GB). Không đổi Docker
RAM, resources, CPU requests/limits hoặc HPA. Native k6 0.57.0 darwin/arm64,
Go 1.23.6 chạy trên cùng host với Docker VM; Gateway runtime cuối v20.20.2 arm64 (ghi trong metadata). Binary SHA256
`e234ca660a9c73b8dafd7d0cbbf4f7edeb4eebcc5ab55a60b6483db2b4658fe7`.

Supabase/PostgreSQL remote (`K8S_DB_MODE=existing`, TLS). Redis/RabbitMQ vẫn
Compose. Namespace `avengers-coffee`, context `docker-desktop`; localhost:3000
LoadBalancer, web :5175, Order :3005. Không dùng port-forward hay generator
container. Order giữ một Pod, không thêm HPA. HPA Gateway/Menu/Identity
2–4 / 1–4 / 1–3, CPU 60%, cooldown tự nhiên về 2/1/1.

## 3. Defined workload

Mỗi iteration gọi tuần tự bốn GET: `/menu/danh-muc`, `/menu/san-pham`,
`/users/branches/public`, `/news?page=1&limit=6`, rồi sleep 3 giây. HTTP 200 và
parse toàn bộ JSON được check cho mỗi response. Timeout client 10s. Profile
capacity riêng: ramp 60s, hold 120s, down 30s; graceful down/stop 15s. Duration
thực tế có thể dài hơn 210s do iteration kết thúc. Profile moderate cũ giữ
nguyên (20→50→100→200, khoảng 3 phút, think 1s).

Cache demo read-only giữ TTL 5.000ms. Cache miss/expiry vẫn query remote DB;
không tăng TTL, cắt dữ liệu, bỏ JSON check, cache auth, test payment/order/write
hoặc gọi provider. `K8S_DEMO_READ_ONLY=true` luôn được giữ trong Kubernetes.

Hai transport variants được ghi riêng: **identity** là k6 cũ không gửi
`Accept-Encoding`; **gzip** gửi `Accept-Encoding: gzip`, server dùng compression
sẵn có, k6 giải nén rồi check đầy đủ JSON. Đây là thay đổi workload transport,
không được gộp vào so sánh cùng workload trước/sau application tuning. Gzip 1.000 fail trên transport-experiment config và shared host; không quy nguyên nhân cho gzip đơn lẻ hoặc claim ngưỡng gzip đã được qualify.

## 4. Thresholds and stability gate

`http_req_failed < 2%`, `checks > 98%`, `http_req_duration p95 < 1500ms`.
Harness áp dụng cùng ba ngưỡng cho tổng lượt **và hold phase**, từ trước lần đo
baseline đầu tiên. Hold gate tránh ramp nhẹ che sustained overload; không thay
ngưỡng sau khi có kết quả. Vì thế 750 VU có global p95 1484,6ms vẫn không qualify
khi hold p95 1607,5ms.

Reject stability khi có restart mới (theo Pod UID), OOMKilled, CrashLoopBackOff,
liveness Killing/BackOff/Eviction mới, node pressure, HPA metric invalid, observer
thiếu hoặc smoke sau tải thất bại. HPA downscale termination bình thường không
phải restart overload. Startup probe connection-refused khi Pod mới khởi động
được lưu, không tự coi là process crash. Hai snapshot liên tiếp Ready ở baseline
trước/sau tải; cooldown bounded 720s. Không chạy fault injection cùng k6.

## 5. Original qualified moderate baseline

[K8S_VERIFICATION_REPORT.md](K8S_VERIFICATION_REPORT.md) ghi lượt final
**44.608 requests, 0 lỗi, p95 505,2ms**, HPA peak Gateway/Menu/Identity 4/4/3,
về tự nhiên 2/1/1; self-healing/rolling restart 60/60 HTTP 200. Đây là số trong
artifact/report cũ, thay vì các con số xấp xỉ trong yêu cầu (44.424 / 590,5ms).
Không dùng moderate để suy luận 1.000–5.000 VU.

## 6. First staircase failure

Evidence cũ `/tmp/avengers-k8s-load-results/k6-1k-to-5k.json` và
`hpa-1k-to-5k.jsonl`: 361.428 requests, 95,98% failed, 4,02% checks,
p95 khoảng 2849ms, k6 provision tới 5.000 VU. Attempted RPS khoảng 1572,9 phần
lớn là errors, không phải useful throughput. Không suy luận riêng từng level.

34 observer samples: node peak **4458m CPU / 2538Mi**, per-Pod peak Gateway
475m/117Mi, Identity 216m/106Mi, Menu 266m/46Mi, News 138m/46Mi, AI 52m/135Mi;
HPA đạt Gateway/Identity/Menu 4/3/4. Gateway restart counts quan sát 1/2/2/3.
`reason=Error, exitCode=137` cùng liveness timeout→Killing; không thấy
`reason=OOMKilled`. Snapshot CPU 2%, RAM 2201Mi sau tải không đại diện peak.

## 7. Root cause evidence

Gateway per-request `console.log` tồn tại trước tuning. Tắt nó là giả thuyết
về chi phí format/stdout/event-loop; không đo event-loop delay trực tiếp nên
không khẳng định logging là nguyên nhân duy nhất. Node stdout pipes trên POSIX
có thể asynchronous; không gọi mọi `console.log` là synchronous.
[Node process I/O](https://nodejs.org/docs/latest-v20.x/api/process.html#a-note-on-process-io).

Proxy mặc định không có Agent keep-alive; audit dependency và integration test
cho thấy upstream connection churn. Bounded pool giảm churn, nhưng Kubernetes
Service cân bằng kết nối: persistent client/upstream connections có thể pin
traffic vào Pod cũ. Keepalive-only run quan sát hai Pod cũ khoảng 497m trong
khi hai Pod scale-up chỉ khoảng 250–277m. Đây là dấu hiệu mất cân đối, không
phải proof tuyệt đối của từng connection. Gateway cgroup `nr_throttled` tăng
mạnh: ở run 750, tỷ lệ throttled periods theo Pod khoảng 39–77%, trong khi
Gateway peak sát quota 500m. CPU counters được sampled; không suy ra event-loop
latency chỉ từ cgroup.

Liveness `/health/live` nhẹ, không query DB; readiness bounded DB query. Không
đổi probe để che overload. Restart do liveness là phản ứng của Kubernetes khi
process không trả probe kịp; không tự chứng minh OOM hoặc DB lỗi.
[Kubernetes probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/).

Transport diagnostic dùng chính k6 0.57.0 xác minh request mặc định không gửi
Accept-Encoding; khi gửi gzip, wire bytes giảm và k6 vẫn parse full decoded
JSON. Real public response: categories 23, products 118, branches **1215**,
news page có 3 item/total 3. Tổng raw body 842.943 bytes/iteration, gzip 97.146
bytes, decoded SHA256 từng route giống hệt. Branch payload 718.448→80.793
bytes. Synthetic compressibility không được dùng làm kích thước dữ liệu thật.
Diagnostic chỉ lưu counts/sizes/digests, không lưu nội dung database.

## 8. Per-level results

| UTC run / policy | VU | Result | Requests | Failed % | p95 / hold p95 ms | RPS | New restarts |
|---|---:|---|---:|---:|---:|---:|---:|
| 14:15:43 [baseline-1000](k8s/verification/capacity/20261013T141543.807876Z-baseline-1000/analysis.json) (identity) | 1000 | ABORTED before load | — | — | — | — | 0 |
| 14:18:07 [baseline-recovered-1000](k8s/verification/capacity/20261013T141807.263585Z-baseline-recovered-1000/analysis.json) (identity) | 1000 | FAIL | 66,032 | 3.6846 | 5421.0 / 5053.6 | 310.0 | 2 |
| 14:25:15 [baseline-500](k8s/verification/capacity/20261013T142515.279073Z-baseline-500/analysis.json) (identity) | 500 | FAIL | 42,068 | 16.8679 | 8327.6 / 9999.9 | 194.9 | 6 |
| 14:33:15 [baseline-250](k8s/verification/capacity/20261013T143315.169149Z-baseline-250/analysis.json) (identity) | 250 | ABORTED before load | — | — | — | — | 0 |
| 14:42:12 [baseline-retry-250](k8s/verification/capacity/20261013T144212.053915Z-baseline-retry-250/analysis.json) (identity) | 250 | STABLE PASS | 49,276 | 0.0000 | 484.6 / 470.5 | 231.3 | 0 |
| 14:53:59 [logging-off-500](k8s/verification/capacity/20261013T145359.475913Z-logging-off-500/analysis.json) (identity) | 500 | STABLE PASS | 83,480 | 0.0000 | 933.6 / 791.0 | 392.1 | 0 |
| 15:05:07 [logging-off-1000](k8s/verification/capacity/20261013T150507.578311Z-logging-off-1000/analysis.json) (identity) | 1000 | EXCLUDED (environment overlap) | 87,660 | 0.0000 | 3120.0 / 3530.1 | 412.2 | 0 |
| 15:22:35 [logging-off-infra-recovered-1000](k8s/verification/capacity/20261013T152234.554302Z-logging-off-infra-recovered-1000/analysis.json) (identity) | 1000 | FAIL | 60,708 | 4.7704 | 6915.7 / 7616.8 | 285.9 | 1 |
| 15:36:47 [keepalive-1000](k8s/verification/capacity/20261013T153647.179339Z-keepalive-1000/analysis.json) (identity) | 1000 | FAIL | 101,628 | 0.0236 | 2972.6 / 3013.8 | 480.8 | 0 |
| 15:57:09 [fairness-1000](k8s/verification/capacity/20261013T155708.735837Z-fairness-1000/analysis.json) (identity) | 1000 | FAIL | 120,464 | 0.5836 | 2053.5 / 2106.4 | 565.6 | 2 |
| 16:12:38 [final-search-750](k8s/verification/capacity/20261013T161237.420162Z-final-search-750/analysis.json) (identity) | 750 | FAIL | 108,240 | 0.0055 | 1484.6 / 1607.5 | 507.7 | 0 |
| 16:45:13 [identity-qualified-1-500](k8s/verification/capacity/20261013T164512.777223Z-identity-qualified-1-500/analysis.json) (identity) | 500 | FAIL | 49,260 | 1.7377 | 4193.6 / 5485.1 | 231.1 | 3 |
| 16:56:01 [gzip-search-1000-1000](k8s/verification/capacity/20261013T165601.046974Z-gzip-search-1000-1000/analysis.json) (gzip) | 1000 | FAIL | 91,648 | 69.1777 | 8153.3 / 6375.9 | 426.8 | 8 |
| 17:05:12 [final-identity-confirm-1-250](k8s/verification/capacity/20261013T170511.755199Z-final-identity-confirm-1-250/analysis.json) (identity) | 250 | FAIL | 37,176 | 0.2421 | 1580.7 / 1902.6 | 173.4 | 0 |
| 17:29:18 [final-logger-search-500](k8s/verification/capacity/20261013T172918.546314Z-final-logger-search-500/analysis.json) (identity) | 500 | STABLE PASS | 66,940 | 0.0000 | 1463.7 / 1471.6 | 313.3 | 0 |
| 17:37:59 [final-logger-confirm-500](k8s/verification/capacity/20261013T173758.965418Z-final-logger-confirm-500/analysis.json) (identity) | 500 | FAIL | 60,996 | 0.0000 | 2558.2 / 3072.0 | 284.9 | 0 |
| 17:46:35 [final-logger-refine-250](k8s/verification/capacity/20261013T174634.781163Z-final-logger-refine-250/analysis.json) (identity) | 250 | STABLE PASS | 48,932 | 0.0000 | 488.5 / 513.3 | 230.0 | 0 |
| 17:54:56 [final-logger-confirm-2-250](k8s/verification/capacity/20261013T175455.894727Z-final-logger-confirm-2-250/analysis.json) (identity) | 250 | STABLE PASS | 50,260 | 0.0000 | 415.0 / 349.8 | 237.8 | 0 |


Các lượt aborted trước load không phải application capacity fail: branches
ban đầu timeout (Identity restart có kiểm soát phục hồi), và một smoke Web 404
transient. Không sửa DB/Web để làm PASS; giữ artifact. Lượt logging-off 1.000
lúc 22:05 bị **EXCLUDED** vì năm Compose app xuất hiện ngoài harness, không có
guard read-only. Người dùng xác nhận đã bật nhầm; chỉ dừng năm app trùng lúc
22:20, giữ infra. Lượt control sau đó được đo lại. Không claim database bất biến
trên toàn máy vì startup của các bản Compose ngoài harness có thể ghi dữ liệu;
qualification Kubernetes và generator chỉ dùng read-only/public GET.

## 9. Bottleneck analysis

Gateway thường sát CPU quota 500m/Pod; HPA 4/3/4 không đủ chứng minh pass.
Menu/Identity/News peak thấp hơn Gateway; readiness DB 503/timeout vẫn xuất hiện
ở một số run. Không đo riêng mọi cache miss/DB query latency, vì thế không kết
luận Supabase không có tác động. SQL diagnostic chỉ đọc grouped connection
states, không restore/reset/query dữ liệu nghiệp vụ.

Node sampled RAM khoảng 2–2,5Gi ở nhiều lượt; không thấy OOMKilled hay
MemoryPressure/DiskPressure mới. Không có cơ sở tăng/giảm RAM limit hoặc VM.
**Host khác node**: host CPU thường 99–100%, 15Gi RAM used và compressor khoảng
8Gi; k6 từng dùng trên 3 core, Docker VM cùng IDE/browser cạnh tranh CPU. Chỉ
quan sát tên executable/CPU/RSS, không tự tắt ứng dụng khác. Đây là giới hạn
**local load-generator / shared-host environment**, không phải production
application capacity độc lập. FD limit của generator 1.048.575; không thấy
`too many open files`, `cannot assign requested address`, hay insufficient VUs
trong các runs được phân tích. Closed-model executor nên không áp dụng
arrival-rate dropped-iterations interpretation.

## 10. Controlled tuning performed

1. Request logger: production default off, dev default on, explicit env override;
   K8s `GATEWAY_REQUEST_LOGGING=false`. Test forwarding `next()` đúng một lần.
2. `GATEWAY_PROXY_KEEP_ALIVE=true`: per-origin HTTP/HTTPS pool max 128 active,
   16 idle, LIFO; socket xét retire sau 30s khi trở về idle pool. Không hủy
   response đang chạy, không retry, giữ timeout proxy 120s. Socket đang được
   tái dùng liên tục từ queued requests có thể chưa về idle: không bảo đảm
   tuổi cứng 30s hay cân bằng từng request. Server close destroy agents.
3. `GATEWAY_MAX_REQUESTS_PER_SOCKET=64`: renew frontend connection sau response
   cuối đã hoàn tất. Respect `Connection: close` qua proxy, để request kế tiếp
   dùng kết nối mới thay vì 503. Integration test actual HTTP proxy kiểm tra
   gzip full body, headers theo request, reuse/renewal và retirement.

Sau các lượt chưa đạt stability, **cấu hình cuối chỉ nhận request logger**;
hai transport experiments được tắt (`false` / `0`) và giữ opt-in trong code,
không coi throughput cải thiện là bằng chứng nên bật mặc định. Đây là rollback
cấu hình experiment về transport trước đó, không rollback guard read-only.

Hai transport flags default off; không thay business routes/body
handling, auth, Order, health/cache/provider logic. HPA/probes/resources giữ
nguyên. Không tăng replicas khi host đã saturation; node CPU thấp hơn 8-core
capacity không đồng nghĩa host còn headroom.
[Node Agent/server policy](https://nodejs.org/docs/latest-v20.x/api/http.html).

## 11. Before/after comparison

| Identity 1.000 VU | Before | Logging off control | + upstream pool | + client budget 64 |
|---|---:|---:|---:|---:|
| p95 ms | 5421.0 | 6915.7 | 2972.6 | 2053.5 |
| Failed % | 3.6846 | 4.7704 | 0.0236 | 0.5836 |
| RPS (attempted / successful) | 310.0 / 298.6 | 285.9 / 272.3 | 480.8 / 480.7 | 565.6 / 562.3 |
| Gateway peak mCPU / MiB | 492 / 62 | 484 / 99 | 501 / 79 | 500 / 70 |
| Menu peak mCPU / MiB | 262 / 46 | 232 / 45 | 192 / 46 | 169 / 47 |
| Identity peak mCPU / MiB | 252 / 64 | 231 / 188 | 145 / 158 | 170 / 106 |
| New Gateway restarts | 2 | 1 | 0 | 2 |
| Node peak mCPU / MiB | 4758 / 2438 | 4613 / 2442 | 3493 / 2406 | 3704 / 2377 |
| Host busy % | 100.00 | 100.00 | 99.87 | 99.87 |
| Result | FAIL | FAIL | FAIL | FAIL |


Các before/after dùng identity, 1.000 VU, cùng think/ramp/hold/cache/threshold.
Host co-load và remote dependency không kiểm soát hoàn toàn; throughput tăng
không chứng minh tuning đơn lẻ giải quyết instability. Logging-off 500 có PASS
đơn lẻ; final 500 fail, nên không claim 500 qualified từ một kết quả đẹp.

## 12. Final qualified capacity and regression

**Maximum qualified concurrent VUs đã kiểm chứng: 250 public-browse VUs**, HTTP không nén, think 3s, cache 5s. Đây là mức cao nhất có hai lượt STABLE PASS trên cùng image/cấu hình/profile cuối; không phải ceiling độc lập của application trong production.

Gateway `avengers/api-gateway:k8s-local-67e1a8b59dee`; logging false, upstream pool false, client budget 0. Hai lần thử không ép replica và không fault injection.

| Final run UTC | Requests | Failed / checks % | p95 / hold p95 ms | RPS / hold RPS | HPA G/I/M peak | New restarts | Node peak mCPU / MiB |
|---|---:|---:|---:|---:|---|---:|---:|
| [17:46:35](k8s/verification/capacity/20261013T174634.781163Z-final-logger-refine-250/analysis.json) | 48,932 | 0.0000 / 100.00 | 488.5 / 513.3 | 230.0 / 290.9 | 4/3/4 | 0 | 2070 / 2281 |
| [17:54:56](k8s/verification/capacity/20261013T175455.894727Z-final-logger-confirm-2-250/analysis.json) | 50,260 | 0.0000 / 100.00 | 415.0 / 349.8 | 237.8 / 303.5 | 4/3/4 | 0 | 1900 / 2272 |

Hold RPS là count của request được gắn phase hold / 120s; k6 submetric `rate` dùng duration toàn run nên không lấy trực tiếp làm sustained RPS. Các p95 là từng lượt, không gộp/average percentile.

| Service | Peak per-Pod mCPU | Peak per-Pod MiB |
|---|---:|---:|
| web-customer | 1 | 7 |
| api-gateway | 265 | 40 |
| identity-service | 159 | 53 |
| menu-service | 125 | 46 |
| inventory-service | 5 | 42 |
| order-service | 9 | 56 |
| news-service | 78 | 46 |
| ai-service | 5 | 178 |

Host busy peak 98.55%; k6 peak 257.6% của một core, RSS 350.0MiB, sampled open FD peak 106.

Before tuning có STABLE PASS đơn lẻ 250, chưa confirm hai lần; logging-only 500 ban đầu cũng chỉ một lượt. Final qualification chỉ dùng hai lượt cuối cùng cùng image/policy, không cộng lượt khác version hoặc transport variant.

| Cùng workload 250 VU | Before (một lượt) | Final A | Final B |
|---|---:|---:|---:|
| Qualified max VU | chưa confirm x2 | 250 x2 | 250 x2 |
| p95 ms | 484.6 | 488.5 | 415.0 |
| Failed % | 0.00 | 0.00 | 0.00 |
| RPS | 231.3 | 230.0 | 237.8 |
| Gateway peak mCPU / MiB | 300 / 39 | 263 / 40 | 265 / 38 |
| Menu peak mCPU / MiB | 145 / 44 | 125 / 46 | 121 / 46 |
| Identity peak mCPU / MiB | 160 / 55 | 136 / 53 | 159 / 53 |
| New restarts | 0 | 0 | 0 |
| Node peak mCPU / MiB | 2554 / 2119 | 2070 / 2281 | 1900 / 2272 |

Không chứng minh tăng max stable capacity so với floor 250 trước đó; cải thiện chính của phase là có hai confirmation cùng cấu hình và phân loại rõ 500 không ổn định. Không dùng throughput cao của experiment bị rollback làm kết quả cấu hình cuối.

Mức 500 không lặp lại ổn định trên cấu hình cuối; hạ candidate theo kế hoạch bounded, không retry đến khi 500 PASS. Chỉ mức thấp hơn đã có hai confirmation mới được qualified.

| Regression cuối | Result |
|---|---|
| Gateway unit/integration | 20 tests, 5 suites PASS; actual proxy gzip/header/socket reuse/renewal và defaults off |
| K8s/harness tests | 24 tests PASS |
| Render / server dry-run / deploy | PASS, 22 resources; DB audit chỉ đọc, readiness/connectivity/smoke PASS |
| Public Socket.IO | WebSocket + polling, synthetic room join/reconnect PASS sau deploy |
| Moderate 200 VU (profile cũ) | STABLE PASS; 37,884 requests, 0.00% failed, checks 100.00%, p95 751.2ms, 208.8 RPS; không new restart/pressure/invalid metrics, natural cooldown + smoke PASS |
| healing availability | 60/60 HTTP 200, chạy riêng sau k6 |
| rollout availability | 60/60 HTTP 200, chạy riêng sau k6 |
| Final state | 8 Deployments Ready; HPA current/desired 2/1/1; smoke PASS; Compose customer apps stopped, infra retained |

Availability chỉ chứng minh 60 mẫu GET category trong từng fault, không zero-error combined stress/fault. Rolling restart giữ nguyên binary. Không teardown hoặc khởi động Compose customer mode ghi DB sau qualification.


## 13. Limitations and stop condition

Docker Desktop single node, local single-machine load generation, Supabase
remote, Redis/RabbitMQ external Compose, public GET only, cache 5s; không full
checkout/payment/order, không multi-Pod Order, không node-level HA, không
production distributed generator. Payload/dataset và host co-load ảnh hưởng
kết quả; sampled peaks có thể bỏ lỡ spike. Hai confirmation chỉ xác nhận test
ngắn đã định nghĩa, không chứng minh endurance nhiều giờ.

Không tiếp tục 2k/3k/4k/5k khi 1k đã fail; không suy luận 5k PASS/FAIL từng mức
từ staircase. Sau ba giả thuyết Gateway và evidence saturation shared host,
stop condition C giới hạn phạm vi tuning local. Benchmark tiếp theo cần
external/distributed generator, host co-load được kiểm soát, cùng dữ liệu,
encoding và thresholds; đo DB/cache-miss latency và event-loop delay trước khi
quyết định thêm CPU/replicas. Không đổi credentials, cache hay RAM để ép PASS.

## 14. Reproduce and inspect evidence

```bash
export K8S_DB_MODE=existing
bash scripts/k8s/smoke.sh
bash scripts/k8s/capacity-test.sh 250 --label confirm-a
bash scripts/k8s/capacity-test.sh 250 --label confirm-b
# Known failing control; run separately for diagnosis:
bash scripts/k8s/capacity-test.sh 1000 --label identity
# Separate transport ladder, never silently mix with identity:
CAPACITY_ACCEPT_ENCODING=gzip bash scripts/k8s/capacity-test.sh 1000 --label gzip
python3 scripts/k8s/summarize-capacity.py
python3 scripts/k8s/archive-capacity.py
```

Start from baseline 2/1/1; review one level, stop on first failure, fine search
250–500 VU, confirm candidate twice. Keep all configuration/encoding fixed.
Do not run fault injection or other benchmarks concurrently. Compose customer
apps must stay stopped; infra remains. Harness refuses overlap and interrupts
only its own generator if overlap appears.

[Evidence index](k8s/verification/capacity/index.json), SHA256 manifest and
per-run `analysis.json`/metadata/summary/sanitized snapshots are archived.
`observer.jsonl.gz` includes Pod UID/image ID/restart counts/HPA/events/top
node+Pod/host/k6/cgroup counters. Per-Pod maxima and simultaneous aggregate
service maxima are different metrics; tables above use per-Pod sampled maxima
through load and cooldown. No raw Secret/env/application logs/query payloads
are archived. Source HEAD in metadata refers to starting commit; working-tree
changes remain uncommitted and immutable deployed image ID is the binary
reference. No commit/push was performed.
