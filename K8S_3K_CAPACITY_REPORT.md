# Phase 3K capacity qualification — 14/10/2026

**3.000 VU chưa được qualified. Phase dừng trước external load vì chưa thiết lập
được data plane an toàn, không qua Quick Tunnel.** Không có maximum stable external
VU được xác lập trong phase này; không có phép đo application ceiling hoặc home
uplink ceiling. Đây là **network/setup abort**, không phải một lượt capacity FAIL.

Clean legacy moderate **200 VU PASS một lần**: 29.084 requests, 0% lỗi, checks
100%, p95 **1.044,8ms**. Giữ nguyên workload/application configuration; kết quả
phục hồi này không phải qualification workload 3K. Regression cuối đạt **131
tests**, self-healing và rolling restart mỗi lượt **60/60 HTTP 200**.

AWS/network đã cleanup. Không commit/push. Branch `branch_thaian`, HEAD
`443fb99696e4fdaaea043776e8c49416b1fd1fbf`; working tree ban đầu đã có artifacts
và documentation của phase 5K, được giữ nguyên.

## Mục tiêu, phạm vi và thay đổi so với phase 5K

Mục tiêu là 3.000 concurrent virtual users trên bốn public-browse GET, JSON đầy
đủ, gzip và think time 3s; không gồm checkout/payment, authenticated write, AI,
browser assets/rendering hoặc mọi nghiệp vụ ứng dụng. Candidate 3K phải qua
normal hold rồi hai lượt độc lập 60/300/60s, recovery tự nhiên giữa các lượt.

[Phase 5K trước](K8S_5K_CAPACITY_REPORT.md) dừng ở external 250: 24.664 requests,
217 HTTP 429, p95 3.011,7ms; Quick Tunnel đạt hard cap 200 in-flight. Không suy ra
application ceiling 250. Phase này **không dùng Quick Tunnel cho benchmark data**;
chỉ dùng một tunnel HTTPS cho control đã được người dùng chấp thuận.

## Environment và audit source hiện tại

Mac Apple M1 Pro, 8 logical CPU, 16 GiB physical RAM. Docker Desktop giữ **8 CPU /
8.319.770.624 bytes RAM**. Kubernetes `docker-desktop`, single node arm64,
namespace `avengers-coffee`. Không thay allocation, application images, resources,
probes, HPA, cache, logger, proxy keep-alive hoặc socket policy. Gateway vẫn là
`avengers/api-gateway:k8s-local-67e1a8b59dee`, logging false, keep-alive false,
max requests/socket 0. HPA min/max G/I/M vẫn **2–4 / 1–3 / 1–4**; Order x1.

`K8S_DB_MODE=existing`, `K8S_DEMO_READ_ONLY=true`, cache TTL 5.000ms.
Supabase/PostgreSQL remote hiện có; Redis/RabbitMQ Compose healthy. Database
audit chỉ đọc; không reset/restore/migrate/seed, gọi provider/payment hoặc chạy
full Compose application stack. Preflight và observer kiểm tra duplicate apps.
Demo flag không thay thế quyền SQL read-only riêng của database credentials.
12 container delivery của dự án khác được giữ nguyên; đây là shared Mac.

Đọc source frontend/Gateway/public routes/cache/health và helper/manifests hiện
tại. Frontend App.jsx vẫn gọi `/menu/danh-muc`, `/menu/san-pham`,
`/users/branches/public`, `/news?limit=100`. Cache process-local, bounded 16 keys,
coalesce misses, serialize/gzip mỗi snapshot, TTL tối đa 5s; query thật khi expiry,
không cache lỗi/stale/private data. Liveness process-only; readiness backend dùng
SQL `SELECT 1`, connection/query timeout mỗi bước 1.000ms. Không nới probes.
[Source manifest](k8s/verification/3k-capacity/source-audit.json).

IPv4 `127.0.0.1:3000` đi Gateway Docker Desktop LoadBalancer; localhost IPv6 có
listener Next.js của dự án khác. Không dừng listener đó hoặc dùng Kubernetes
port-forward. Phase này không chứng minh full browser login/UI qualification.

## Clean legacy baseline và regression latency

Trước tải: không k6/cloudflared/SSH benchmark dư, không customer Compose; Pods
Ready, CPU metrics hợp lệ, HPA natural 2/1/1; DB audit/connectivity/smoke PASS.
Chạy đúng **một lần** native k6 0.57.0 với profile cũ `customer-browse.js`: think
1s, news `page=1&limit=6`, encoding legacy, stages 20/30/40/60/30s với peak 200.
Workload SHA256 `64bec53696c086c65c3b2fc3792105bca46af2bb2526b660083014108cb42f5d`.
Không chạy AWS/helper/tunnel trong thời gian load legacy.

| Lượt legacy 200, cùng workload/config ứng dụng | Requests | Failure | Checks | p95 ms | Result |
|---|---:|---:|---:|---:|---|
| Phase 5K, trước external | 21.164 | 0% | 100% | 2.146,1 | FAIL latency |
| Phase 5K, sau cleanup | 25.632 | 0% | 100% | 1.598,9 | FAIL latency |
| Phase 3K, clean recheck | 29.084 | 0% | 100% | **1.044,8** | **STABLE PASS, một lượt** |

Load 05:37:59–05:41:00 UTC; natural recovery và post-smoke hoàn tất 05:46:13 UTC.
Không có new restart/OOM/CrashLoop/liveness restart, node pressure hoặc invalid
HPA; peak G/I/M 4/3/4. Node sampled peak 3.034m CPU / 2.026Mi RAM. Host sampled
busy peak 100%; native k6 peak 169,1% của một core, RSS khoảng 244,4MiB.

Idle sample trước tải: CPU idle 66,30%; load 3,86/4,51/5,03; PhysMem 15G used,
compressor 7.902M, swap used 6.376,31M. Docker stats giữ cả 12 delivery container.
Gateway throttled-period fractions khoảng 10,4–16,5%; peak per-Pod CPU 300m.
Có ba startup connection-refused ở Pod scale-up; **Identity readiness 503 x6 và
Menu x5** trong cửa sổ observer load/cooldown, được giữ trong evidence. Readiness
là dependency check bounded; chưa instrument riêng connection/query/cache miss
latency nên không quy mọi tail cho Supabase hoặc quota.

PASS cho thấy legacy threshold phục hồi trong lượt sạch này. Không có code tuning
để tạo cải thiện, và shared-host variability/dependency tails vẫn là giới hạn
thực nghiệm. Legacy không có phase tags/p99; hold p95/p99 không được suy diễn.
[Legacy evidence](k8s/verification/3k-capacity/legacy-200/analysis.json).

## Workload mới và payload audit

[Profile 3K](load-tests/k6/customer-browse-3k.js) giữ bốn GET tuần tự rồi sleep 3s,
Accept JSON + gzip, parse toàn bộ JSON và kiểm tra mọi item/HTTP 200/gzip. Normal
60/120/30s, long qualification 60/300/60s, grace 15s. Quality toàn run và hold:
failure <2%, checks >98%, p95 <1.500ms; hold phải có requests. Stable còn yêu cầu
0 overload restart/OOM/CrashLoop/liveness storm/pressure, metrics hợp lệ,
post-smoke PASS và natural recovery 2/1/1. Profile thêm p99 để quan sát.

Workload SHA256 `a20876cc25e03840a5453e20c5accd6dcfa2a0315f6bde67b73d629e84a84217`.
Profile khởi tạo thành công với reverse-forward loopback; test từ chối Quick
Tunnel và URL local Gateway trực tiếp trên EC2 để tránh benchmark nhầm target.

| Route | Items | Identity bytes | Gzip bytes |
|---|---:|---:|---:|
| `/menu/danh-muc` | 23 | 2.390 | 455 |
| `/menu/san-pham` | 118 | 116.121 | 13.198 |
| `/users/branches/public` | 1.215 | 718.448 | 80.793 |
| `/news?limit=100` | 3 | 5.986 | 2.702 |

Audit lại trên Gateway thật: decoded JSON/digests identity và gzip giống nhau,
không double compression/corruption, không projection/truncate. Chỉ lưu field
names/counts/sizes/digests. Tổng cycle **97.148 gzip bytes**. Với giả định latency
và parse time gần 0, 3.000 VU / think 3s tương ứng khoảng 1.000 cycles/s,
**777,2Mb/s payload**; branches riêng khoảng 646,3Mb/s. Đây là sizing theo giả
định, không phải throughput/uplink ceiling đã đo; latency thực tăng cycle time.
[Payload audit](k8s/verification/3k-capacity/regression/payload-audit.json).

## Network strategy và first blocking condition

**Path A:** read-only default route/LAN/public IPv4; NAT-PMP public-address request
không có response; SSDP IGD discovery không tìm thấy UPnP WAN service. Chưa có
mapping protocol usable. Router WAN không đọc được nên **CGNAT chưa được xác lập**.
Không tạo NAT mapping, pf anchor, router/firewall edit hoặc yêu cầu sudo password.
[Discovery](k8s/verification/3k-capacity/network-discovery.json).
Packet NAT-PMP theo [RFC 6886](https://www.rfc-editor.org/rfc/rfc6886).

**Path B, đã chuẩn bị nhưng không kết nối thành công:**

```text
planned: EC2 k6 -> 127.0.0.1:13300 -> reverse SSH
        -> Mac GET allowlist 127.0.0.1:18080
        -> 127.0.0.1:3000 Docker Desktop LoadBalancer -> real Gateway Pods
control: EC2 helper -> separate HTTPS control tunnel -> token-protected loopback
```

EC2 healthy; user-data chạy native k6/helper, worker xác nhận sshd listen 443 và
workload SHA khớp. SG chỉ TCP 443 từ **hai observed Mac egress /32**, không mở
SSH/3000/all-TCP cho 0.0.0.0/0. Dedicated sshd chỉ public-key Ubuntu, remote
forwarding loopback, không password/root login/remote command. Mac SSH `-N -R`
timeout ở TCP connect, trước SSH handshake; **forward chưa được established**.

HTTPS public-address observation khác UDP STUN; TCP/TLS STUN còn cho địa chỉ khác.
Ba TLS/STUN binding liên tiếp tới cùng endpoint port 443 có **ba public egress
IPv4 khác nhau**; recheck bằng parser đã test lặp lại hiện tượng ba địa chỉ khác
nhau. Không có proxy environment hoặc system proxy enable flag được quan sát.
Điều này chứng minh egress không ổn định trong phép đo, **không chứng minh chính
xác nguyên nhân SSH timeout**, không suy ra CGNAT/VPN/ISP ceiling. STUN chỉ vài
packet chẩn đoán, không TURN allocation/relay hoặc traffic k6; dùng service theo
[Cloudflare network documentation](https://developers.cloudflare.com/realtime/realtimekit/network-allowlist/).
[Egress evidence](k8s/verification/3k-capacity/egress-recheck.json).

Không mở CIDR rộng, đoán thêm source ranges, tạo EC2 để retry mù, hoặc dùng lại
Quick Tunnel data. Bốn SSH sessions chỉ hữu ích khi đã có connection và đo được
single-tunnel head-of-line limitation; điều kiện đó chưa đạt. Áp dụng stop C ở
**data-plane reachability**; chưa đo được bandwidth adequacy.

## AWS generator và adequacy gate

Một **m7i-flex.large 2 vCPU/8 GiB x86_64**, `i-00eba98d0766d0e2f`, Sydney
`ap-southeast-2a`, Canonical Ubuntu 24.04 `ami-0f5e1e0151e5b95ed`. Không retry
c7g.xlarge, upgrade Free Plan, sửa IAM/SCP/quota hoặc tạo AWS Kubernetes target.
Root 20GiB gp3/DeleteOnTermination, IMDSv2 required, không IAM role/EIP/NAT Gateway.
Mọi resource có Project/Purpose/ManagedBy/Phase/RunId đúng phase 3K.

Native k6 2.3.0 commit `e088784614`, Go 1.26.8 linux/amd64, official checksum
verified; binary SHA256 `e001bbf39ba67424a85c9c8516440ba5c73ecf7a6021be96c76194380c15f260`.
FD soft/hard 65.536/524.288. [Boot evidence](k8s/verification/3k-capacity/3k-20261014T054657Z-8dccb3/boot.json).

Policy chuẩn bị trước load: reject CPU ≥90% trong ≥3 consecutive ~5s samples,
available RAM <256MiB, FD headroom <20%, socket exhaustion, rõ network saturation
hoặc insufficient coverage. **Chưa có k6 run nên adequacy chưa được đánh giá.**
Không tạo generator 2/3 vì không có evidence generator saturation. Không có
distributed execution hoặc aggregation p95 giữa nhiều máy trong phase này.

## Load ladder, tuning và final decision

EC2 curl baseline tối thiểu 20 requests/route **chưa chạy** vì reverse-forward
readiness fail; không thay bằng Mac curl hoặc curl control tunnel. Không có
external RPS, HTTP status counters, latency hoặc route p99 để báo.

| VU / workload | Requests | RPS | Failure % | Checks % | p95 ms | hold p95 | G / I / M peak | Node CPU peak | Generator CPU peak | Outcome |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 200, legacy local | 29.084 | 161,10 | 0 | 100 | 1.044,8 | — | 4 / 3 / 4 | 3.034m | 169,1% một core, Mac | STABLE PASS một lượt |
| 250, external baseline dự kiến | — | — | — | — | — | — | — | — | — | Không chạy: network/setup abort |
| 500 / 1.000 / 1.500 / 2.000 / 2.500 / 3.000 | — | — | — | — | — | — | — | — | — | Không chạy sau stop network |

| Hypothesis / evidence | Change / validation | Result | Keep / rollback |
|---|---|---|---|
| Legacy latency có shared-host/helper variability; hai lượt lịch sử FAIL | Một clean run, workload/config không đổi, không AWS/tunnel dư | p95 1.044,8ms PASS; readiness tails còn được ghi | Giữ app config; không attribution cải thiện cho tuning |
| Quick Tunnel là cap cũ; direct mapping chưa usable | Chuẩn bị reverse SSH 443, user-data/control riêng, SG 2×/32, native boot/checksum/listener valid | TCP connect timeout; zero external load | Cleanup toàn bộ owned setup |
| Egress source có thể không ổn định | Read-only HTTPS/UDP/TCP-TLS STUN, parser validation | Ba consecutive TCP443 connections khác nguồn | Giữ diagnostic/evidence; không broaden ingress |
| HPA/CPU/payload/cache application tuning | Chưa có external target bottleneck measurement | Không experiment ứng dụng | Giữ toàn bộ cấu hình ban đầu |

**Maximum repeatably qualified external VU chưa được xác lập. 3.000 VU chưa được
qualified vì safe non-Quick data plane chưa thiết lập được.** Không có candidate
cho confirm 300s x2 hoặc refinement 2.750. Phân loại B reachability/setup; A/C/D
external capacity chưa đo. Không coi zero external errors là PASS khi không có tải.

## Final regression

Sau setup abort, thêm guard helper: ba TCP443 observations mới trong 10 phút
phải có cùng source IPv4 trước khi tạo key/SG/EC2. Source restriction của attempt
tương lai dùng địa chỉ TCP đã đo; guard không được dùng để tự động retry phase.
Không launch instance mới để test guard; unit tests kiểm tra missing/unstable case.

131 tests PASS: Gateway 20, Identity 39, Menu 20, News 9, Kubernetes Python 24,
AWS/network helper Python 16, Node ingress/control security 3. Lần Gateway đầu
bị sandbox chặn synthetic listen (`EPERM`); giữ log đó và chạy lại cùng tests với
quyền bind loopback, không nới timeout/test assertions. Không có product test
failure bị bỏ qua. [Checks](k8s/verification/3k-capacity/regression/checks.json).

Render 22 resources, server dry-run/deploy/smoke PASS; application images/resources/
HPA giữ nguyên. Self-healing và rolling restart tách tải: **60/60 HTTP 200 mỗi
lượt**. Socket.IO WebSocket/polling synthetic connect/join/reconnect PASS. Final
baseline Ready 2/1/1; không scale Order, không checkout/provider/DB mutation.

## Runtime, cost và cleanup

Một EC2 setup attempt, không replacement/additional generator. Launch 05:47:42
UTC; cleanup-complete evidence 05:51:14 UTC: **212,2s / 3,54 phút** upper bound.
Public Sydney Linux/shared m7i-flex.large **$0,1197/hour**, effective 01/10/2026,
kiểm tra lại từ [AWS public price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-southeast-2/index.csv).
Compute list-price upper bound **$0,0071**; chưa gồm EBS/IPv4/transfer/credits,
không phải actual bill. Không kiểm tra lại billing/credit balance. Cost policy
target ≤$5, projected reserve $2,50; local deadline 225 phút từ launch và guest
terminate-on-shutdown +230 phút. Không có runtime gần giới hạn này.
[Runtime/cost](k8s/verification/3k-capacity/runtime-cost.json).

`finally` dừng owned control/ingress/SSH; terminate và wait EC2, xóa SG/orphan
volume/key pair có đủ ownership tags, remove local temporary key/token/user-data.
Key mới có tên riêng theo RunId; không đọc/overwrite/xóa local key cũ. Không xóa
VPC/subnet/routes/IGW hoặc resource unrelated. Không tạo NAT mapping/pf anchor.

Final describe và local kiểm tra 06:08:58 UTC: **0 owned active/stopped EC2,
0 SG, 0 volume, 0 temporary remote key, 0 k6/cloudflared/SSH, không listener ở
18080/18082/18083**. Instance còn thấy với state terminated. Public IP/nonce/
user-data/private key không vào repository evidence. Infra và unrelated services
được giữ nguyên. [Final cleanup](k8s/verification/3k-capacity/final-cleanup.json).

## Reproduction và bước tiếp theo

Không launch/retry blindly trên egress hiện tại. Trước một external attempt mới,
cần data path reachable với source restriction an toàn: direct mapping đã xác
minh hoặc SSH egress ổn định; sau đó baseline **80 EC2 curl samples** rồi 250 VU.
Không chuyển Kubernetes target ra AWS trong phase này.

```bash
export AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing BASE_URL=http://127.0.0.1:3000
# Chỉ diagnostics; IP chỉ lưu private /tmp, xóa khi kết thúc.
python3 scripts/aws-k6/network-3k.py
python3 scripts/aws-k6/egress-3k.py
# Chỉ sau khi network prerequisite được giải quyết:
python3 -u scripts/aws-k6/phase-3k.py start
# Sau READY, review independent run + adequacy trước level tiếp theo:
python3 scripts/aws-k6/phase-3k.py run /tmp/SESSION 250 baseline
python3 scripts/aws-k6/analyze-3k.py /tmp/SESSION/TIMESTAMP-baseline-250
python3 scripts/aws-k6/phase-3k.py finish /tmp/SESSION
# Recovery chỉ resource có đủ phase ownership tags:
python3 scripts/aws-k6/phase-3k.py cleanup /tmp/SESSION
```

Helper hiện triển khai một generator; chưa triển khai distributed aggregation
vì chưa đạt điều kiện đo để scale generators. Nếu một phase sau cần 2/3 machines,
phải partition VUs/synchronize và merge raw distributions/histograms đúng, không
average p95. Evidence compact, observer/log gzip, SHA256 manifest; giữ cả setup
abort và sandbox failure. [Evidence index](k8s/verification/3k-capacity/index.json).
