# Phase 5K capacity qualification — 14/10/2026

**5.000 VU chưa được qualified.** Baseline external đầu tiên, 250 VU, FAIL:
24.664 requests, 217 HTTP 429, p95 3.011,7ms (hold 3.224,8ms). Dừng ladder tại
mức này vì **Cloudflare Quick Tunnel/network path** trở thành giới hạn; không
tuning ứng dụng để che lỗi intermediary. Chưa xác lập maximum stable VU cho
đường external này, và chưa đo được capacity riêng của application.

AWS đã cleanup đầy đủ. Không commit/push. Baseline repository sạch:
`branch_thaian`, HEAD `443fb99696e4fdaaea043776e8c49416b1fd1fbf`.

## Mục tiêu và phạm vi

Qualification dự kiến: 5.000 concurrent virtual users trên workload customer
public-browse được định nghĩa dưới đây; cần hai lượt độc lập 60/300..600/60s,
cùng cấu hình và thresholds, không overload restart, generator/path đủ khả năng.
Không gồm checkout, order/payment, voucher/wallet mutations, AI chat, authenticated
write flows, assets/rendering của browser hoặc toàn bộ nghiệp vụ ứng dụng.

[Qualification local trước](K8S_CAPACITY_REPORT.md) có 250 VU identity x2 ngày
13–14/10, trên shared Mac. Phase này đổi generator, transport gzip và news route
theo frontend hiện tại; không so trực tiếp throughput như cùng workload trước/sau.
Hai lượt legacy 200 VU trong phase hiện tại cũng không đạt p95; giữ cả hai kết quả.

## Environment và AWS

Mac **Apple M1 Pro, 8 logical CPU, 16 GiB RAM**. Docker Desktop giữ **8 CPU /
8.319.770.624 bytes RAM**; Kubernetes `docker-desktop`, single node arm64,
namespace `avengers-coffee`. Không đổi allocation, manifests, resources, probes,
HPA, cache hoặc application images. Gateway immutable image
`avengers/api-gateway:k8s-local-67e1a8b59dee`, logging false, proxy keep-alive false,
max requests/socket 0. Một node không chứng minh node-level HA.

`K8S_DB_MODE=existing`, `K8S_DEMO_READ_ONLY=true`, cache TTL **5.000ms**.
Supabase/PostgreSQL remote hiện có; Redis/RabbitMQ Compose healthy. Chỉ SQL audit
read-only và public GET; không seed/restore/migrate/reset, gọi payment/provider
hay đổi database architecture. Flag không thay thế SQL role read-only riêng.
Compose customer applications không chạy trùng. 12 container của dự án delivery
khác được giữ nguyên; Mac là shared host, không phải lab cô lập. Host CPU sampled
peak 96,6% ở lượt external, compressor khoảng 7–8 GiB; node RAM thấp không tự
chứng minh host còn headroom.

Profile AWS `avengers-k6`, region **ap-southeast-2**. Sau email additional
validation, kiểm tra lại c7g.xlarge: offering ở 2a/2b/2c, 4 vCPU/8 GiB arm64,
Canonical AMI `ami-0ad88ad11d3502d29` available/compatible; dry-run trả
`DryRunOperation`. **Launch thật vẫn trả InvalidParameterCombination: not
eligible for Free Tier.** Không upgrade plan hoặc sửa IAM/SCP/quota.

Người dùng chấp thuận **m7i-flex.large, 2 vCPU/8 GiB x86_64**, FreeTierEligible=true.
Generator thành công: `i-0103ed421c9b50c5d`, AZ `ap-southeast-2a`, Ubuntu 24.04
Canonical AMI `ami-0f5e1e0151e5b95ed`, root 20 GiB gp3/DeleteOnTermination.
IMDSv2 required; không IAM role, EIP, NAT, EKS/RDS, node/target EC2 thứ hai.
M7i-flex có baseline CPU 40% và khả năng dùng full CPU phần lớn thời gian;
không coi nó tương đương dedicated c7g 4 vCPU. [AWS M7i-flex specifications](https://aws.amazon.com/ec2/instance-types/m7i/).

k6 **2.3.0**, commit `e088784614`, Go 1.26.8, linux/amd64, official release
archive checksum verified. Binary SHA256:
`e001bbf39ba67424a85c9c8516440ba5c73ecf7a6021be96c76194380c15f260`.
FD soft/hard 65.536 / 524.288. [Worker boot evidence](k8s/verification/5k-capacity/5k-20261014T043856Z-6d555f/boot.json).

## Network và bootstrap

```text
EC2 native k6 → HTTPS Cloudflare Quick Tunnel
             → Mac loopback GET allowlist :18080
             → 127.0.0.1:3000 Docker Desktop LoadBalancer → real Gateway Pods

EC2 helper → separate HTTPS control tunnel → token-protected loopback :18082
```

Không benchmark application trên EC2 localhost, không port-forward Kubernetes.
Mac `localhost:3000` IPv6 đang trỏ tới Next.js của dự án khác; IPv4 trả đúng
Gateway. Không dừng ứng dụng đó. Smoke/API tests và ingress dùng IPv4 rõ ràng;
không claim full browser UI/login đã qualified trong phase này.

Quick Tunnel là intermediary thử nghiệm, không có uptime guarantee, hard cap
**200 in-flight requests**, vượt cap trả 429. [Cloudflare documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
Ingress stream đầy đủ bytes, không thêm cache/compression, chỉ bốn GET exact;
chặn mọi write/private/admin path, không forward Authorization/cookies.

Ba phiên SSH bootstrap bị gián đoạn; một thử nghiệm multiplexing còn gặp Unix
socket path quá dài, đã sửa path trong helper. Chuyển sang user-data/outbound HTTPS;
phiên cloud-init đầu fail vì installer giả định HOME tồn tại, đã sửa sang
K6_INSTALL_DIR rõ ràng. Đây đều là **setup abort trước k6**, không capacity fail.
Mỗi phiên được cleanup trước khi tạo replacement; tối đa một EC2 hoạt động cùng lúc.
Tổng có **5 instance serial**, gồm 4 setup abort và 1 thực sự benchmark, không có
generator/target thứ hai chạy đồng thời. [Attempt index](k8s/verification/5k-capacity/index.json).

Automatic approval review ban đầu chặn HTTPS control vì token/artifact đi qua
Cloudflare. Người dùng sau đó chấp thuận rõ luồng này. Chỉ k6/helper vào AWS
user-data; token tạm, fixed jobs và sanitized metrics qua Cloudflare, không app/
AWS credentials, private key hoặc business response body. SG cuối **không inbound**.
Token/user-data local đã xóa sau cleanup; local private key giữ nguyên.

## Workload, payload và cache audit

[Profile mới](load-tests/k6/customer-browse-5k.js): bốn GET tuần tự, rồi **sleep 3s**;
ramp/hold/down **60/120/30s**, grace 15s. Accept JSON + **Accept-Encoding: gzip**.
k6 giải nén, parse toàn bộ JSON, kiểm tra mọi item theo route contract, HTTP 200
và gzip header. Không bỏ JSON validation, truncate dữ liệu hoặc thay think time.
Workload SHA256:
`459b51aecc33a57234dfcfff612708e5760084956fd3fb17714d9f23233ba3f3`.

Frontend App.jsx/Stores/Cart/News hiện gọi news **`/news?limit=100`**, khác route
legacy `page=1&limit=6`. React Query/client caching và browser assets không được
mô phỏng; đây là vòng browse lặp khá tích cực, không mô hình mọi hành vi khách hàng.

| Route | Items | Identity bytes | Gzip bytes | Fields/semantics frontend cần |
|---|---:|---:|---:|---|
| `/menu/danh-muc` | 23 | 2.390 | 455 | ID/name, parent/hierarchy/icon |
| `/menu/san-pham` | 118 | 116.121 | 13.198 | product/category, prices, images, descriptions, variants/sizes/toppings, badges |
| `/users/branches/public` | 1.215 | 718.448 | 80.793 | code/name/address/city, hours/phone/image/map, type, latitude/longitude |
| `/news?limit=100` | 3 | 5.986 | 2.702 | items/total/page/limit, title/category/author/image/description/content/date/views |

Tổng mỗi cycle **842.945 → 97.148 bytes**, khoảng 8,68×. Decoded SHA256 identity/
gzip giống nhau từng route; không double compression hoặc đổi response semantics.
Chỉ lưu field names/counts/sizes/digests, không response data.
[Payload evidence](k8s/verification/5k-capacity/regression/payload-audit.json).

Cache hiện tại process-local per Pod: coalesce misses, serialize/gzip một lần mỗi
snapshot, bounded 16 keys, tối đa 5s, expiry query thật, không cache lỗi/stale sau
query failure hoặc auth/private data. Menu query full catalog + categories/sales
badges; Identity query ACTIVE branches + mapping; News published/paginated query.
Không shared Redis cache/projection/pagination mới: chưa có cơ sở tuning application
khi giới hạn đã được chứng minh ở intermediary. Health live process-only; ready
dependency checks bounded. Không nới timeout/probe/threshold.

## Thresholds và adequacy gate

Failure **<2%**, checks **>98%**, duration **p95 <1.500ms**, áp dụng toàn run **và
hold**; hold phải có requests. Stable target còn yêu cầu không restart mới/OOM/
CrashLoop/liveness storm/pressure, HPA metrics valid, post-smoke PASS, recovery tự
nhiên về 2/1/1. Startup connection-refused ở Pod mới được lưu riêng.

Trước baseline external, adequacy gate được cố định: reject EC2 CPU ≥90% trong
ba interval ~5s liên tiếp ở hold, available RAM <256MiB, FD headroom <20%, observer
coverage thiếu, hoặc Quick Tunnel 429 cần chẩn đoán. Không ghi per-point JSON
khối lượng lớn; k6 summary giữ status counters/route hold p95 và timings; observer
numeric CPU/RAM/FD/network mỗi 5s. Submetric observation thresholds không thay
quality thresholds. [Final qualification gate](k8s/verification/5k-capacity/5k-20261014T043856Z-6d555f/20261014T044352Z-baseline-250/qualification.json).

## Baseline và first failure

EC2 curl baseline 12/12 HTTP 200, DNS khoảng 0,5–4ms, connect 1–2ms, TLS khoảng
20–24ms, total **0,297–3,510s**. TTFB có jitter lớn ngay lúc ít tải. Gzip body sizes
khớp audit; không dùng networkQuality error cũ làm bằng chứng.
[Network baseline](k8s/verification/5k-capacity/5k-20261014T043856Z-6d555f/network-baseline/network.json).

| VU | Requests | Failed / checks | p95 / hold p95 ms | RPS / hold RPS | Result |
|---|---:|---|---:|---:|---|
| 250 | 24.664 | 0,8798% / 99,1202% | 3.011,7 / 3.224,8 | 115,62 / 141,275 | FAIL; network adequacy reject |
| 500 / 1.000 / 2.000 / 3.000 / 4.000 / 5.000 | — | — | — | — | Không chạy sau first clear failure |

Worker job bắt đầu 04:44:17,970 UTC, k6 finish 04:47:51,976 UTC; k6 test duration
213,317s. Useful RPS 114,60. Hold failure 1,2800%, checks 98,7200% vẫn qua hai
ngưỡng; **latency fail**, không đổi threshold để báo PASS. Không long-hold 5k/
confirm x2 vì không có candidate hợp lệ.
[Target analysis](k8s/verification/5k-capacity/5k-20261014T043856Z-6d555f/20261014T044352Z-baseline-250/analysis.json),
[external analysis](k8s/verification/5k-capacity/5k-20261014T043856Z-6d555f/20261014T044352Z-baseline-250/external-analysis.json).

## Bottleneck evidence và tuning decision

**B — network/tunnel, primary observed limitation:** 217 response 429; origin
chỉ nhận **24.447 HTTP 200 của lượt k6**, không 429/502/error. Ingress cumulative
24.459 requests = 12 baseline + 24.447 successful k6 requests; peak active **200**.
Đối chiếu đúng hard cap Quick Tunnel. Checks của cả 24.447 success đều qua full
JSON/gzip; 651 failed checks = 217×3, không thấy success bị cắt/corrupt body.

Receiving p95 **2.413,4ms**, waiting p95 1.026,3ms, TLS/connect p95 0 ở pooled
requests. Branch p95 **4.061,6ms**, hold 4.232,3ms; ba route nhỏ hold p95 khoảng
981–1.194ms. Đây là bằng chứng đường truyền/intermediary làm dữ liệu lớn chậm.
EC2 sampled RX peak 4,65 MB/s (~37,2 Mb/s) là throughput quan sát, **không** đo
ceiling ISP hay tách được mọi phần Cloudflare/home uplink/QUIC.

**A — generator:** CPU peak 63,09%, k6 125,22% của một core, RSS 557,5MiB,
FD peak 255/65.536, available RAM tối thiểu 6,58GiB; 43 samples. Không có sustained
CPU saturation theo gate, FD exhaustion hoặc memory pressure.

**C — target:** HPA G/I/M peak **4/3/4**, node sampled peak **2.028m / 2.001Mi**;
Gateway per-Pod peak **176m / 34Mi**, Identity 220m/56Mi, Menu 160m/46Mi.
Gateway throttled-period fractions khoảng 1,2–3,25%; không chứng minh quota là
primary limiter. **0 new restart**, không OOM/pressure/liveness storm, hai startup
probe connection-refused khi scale-up; post-smoke PASS. Recovery snapshot 04:52:50
UTC ở 2/1/1. Không giả replica để tạo kết quả.

**D — dependency:** readiness/audit/connectivity pass, không endpoint 503 trong
capacity run. Cache miss/query latency không được instrument độc lập, nên không
khẳng định Supabase không góp phần vào tail latency. Không đổi DB/infra để né lỗi.

Giữ nguyên app configuration. Không tăng HPA, CPU/RAM, TTL, bật transport
experiments, hoặc đổi payload. Footprint không đổi:

| Policy | CPU requests / limits | RAM requests / limits |
|---|---:|---:|
| Baseline G2/I1/M1 + other services | 850m / 4.500m | 1.536Mi / 3.200Mi |
| HPA max G4/I3/M4 + other services | 1.375m / 7.500m | 2.432Mi / 4.992Mi |

Surge/system/Compose còn cần headroom. Tăng Pod hoặc quota không loại bỏ hard cap
ở tunnel. Stop condition network được áp dụng trước application tuning; không
tạo target Kubernetes EC2 thứ hai. Một phase tiếp theo cần ingress/generator phù
hợp hơn và đo lại từ baseline; chuyển target ra AWS là scope/environment khác,
cần chấp thuận riêng.

## Regression và giới hạn qualification

121 unit/security tests PASS: Gateway 20, Identity 39, Menu 20, News 9, Kubernetes
Python 24, AWS helper Python 7, Node ingress/control 2. Render 22 resources, server
dry-run/deploy/smoke PASS; Socket.IO WebSocket/polling synthetic connect/room join/
reconnect PASS. Self-healing và rolling restart tách tải: **60/60 HTTP 200 mỗi lượt**.

| Legacy moderate 200 VU, identity, cùng app/config | Requests | Errors / checks | p95 ms | Outcome |
|---|---:|---|---:|---|
| Trước external baseline | 21.164 | 0% / 100% | 2.146,1 | FAIL latency |
| Sau AWS/helper cleanup | 25.632 | 0% / 100% | 1.598,9 | FAIL latency |

Cả hai không restart/pressure mới, post-smoke PASS và natural recovery; **không
qualified lại moderate 200 trên shared environment hiện tại**. Lượt sau kiểm tra
giả thuyết overhead helper, không đổi app/threshold/think/encoding; cải thiện nhưng
vẫn FAIL nên dừng, không chọn một số đẹp hoặc ép retry đến PASS. Qualification local
250 x2 trong report trước giữ nguyên là evidence lịch sử, không phải kết quả mới.
[Regression evidence](k8s/verification/5k-capacity/regression/checks.json).

Kết luận: **không có final max stable external VU được thiết lập trong phase này**;
250 là first tested failing level qua Quick Tunnel. Không suy ra application
ceiling 250 hay 5.000 real users thực hiện mọi chức năng. HTTP correct/availability
và performance qualification được báo riêng.

## Runtime, cost và cleanup

User-reported Free Plan credits $120 / expiry 2027-04-14 không được kiểm tra lại
billing trong phase. Public AWS Sydney price-list Linux/shared m7i-flex.large
**$0,1197/hour**. Tổng launch→verified-cleanup upper bound của 5 serial instances
**36,58 phút**, compute list-price upper bound khoảng **$0,073**; chưa gồm EBS,
IPv4/egress/credit treatment và không phải actual bill. Instance lâu nhất khoảng
15 phút; không phiên nào gần hard stop 4 giờ. [Runtime/cost evidence](k8s/verification/5k-capacity/runtime-cost.json),
[AWS public price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-southeast-2/index.csv).

Every phase finally cleanup; guest shutdown configured terminate +230 minutes;
explicit finish xóa remote key bằng recorded KeyPairId. Final AWS verification:
**0 owned active/stopped EC2, 0 SG, 0 volume, remote key avengers-k6-temp absent**.
Final DescribeInstances còn thấy 4 terminated IDs; instance setup đầu đã verified
terminated ở cleanup riêng và không còn trong enumeration sau hơn một giờ.
Giữ evidence cả 5 IDs, không bỏ setup failures. Không xóa VPC/subnet/routes/IGW,
resource unrelated hoặc local private key. Tunnels/ingress/control đã dừng.
[Final cleanup](k8s/verification/5k-capacity/final-cleanup.json),
[per-phase cleanup](k8s/verification/5k-capacity/5k-20261014T043856Z-6d555f/cleanup.json).

## Reproduction

Đọc [AWS helper instructions](scripts/aws-k6/README.md). Remote key đã được xóa;
reconcile/recreate dedicated key an toàn trước một phase mới, không đoán trạng
thái hoặc overwrite local key. Không retry c7g blindly hay upgrade Free Plan.

```bash
export AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing BASE_URL=http://127.0.0.1:3000
python3 -u scripts/aws-k6/https-session.py
# Sau READY, SESSION là thư mục private /tmp được in ra:
python3 scripts/aws-k6/session.py run /tmp/SESSION 250 baseline
python3 scripts/aws-k6/analyze.py /tmp/SESSION/TIMESTAMP-baseline-250
# Review cả result.json và qualification.json; stop first failure.
python3 scripts/aws-k6/session.py finish /tmp/SESSION
```

Không chạy higher level trên đường hiện tại sau evidence này. Artifact archive
allowlist + gzip, không user-data/token/private key/env/database response body;
SHA256 manifest cho mọi file. [Evidence index](k8s/verification/5k-capacity/index.json).
