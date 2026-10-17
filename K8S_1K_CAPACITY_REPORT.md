# Kubernetes capacity — kết quả cuối ngày 17/10/2026

**500 VU: QUALIFIED, hai lượt PASS độc lập; một lượt giữ tải 300 giây.**
**750 VU: INVALID GENERATOR. 1000 VU: NOT RUN / NOT QUALIFIED.**
Mức cao nhất có bằng chứng lặp lại là **500 VU**. Không suy ra trần của ứng dụng
là 500: lượt 750 bị giới hạn ở máy phát tải, trong khi các HTTP gate quan sát được
vẫn đạt. Không dùng kết quả không hợp lệ này để chứng nhận 750 hoặc chạy 1000.

Theo yêu cầu mới nhất, kết quả được giữ cục bộ trên `features_k8s`, **không push
GitHub, không đổi authentication, không merge**. Starting HEAD:
`0a9b928c7c596c8772cf83019342f392e96a4d2e`; delivery commit xem `git log -1`.
Worktree riêng `cnm-avengers-coffee-microservices-AI-k8s`; không sửa worktree
`branch_thaian`, DataPlatform, Compose hoặc cấu hình CPU/RAM/Docker Desktop trên Mac.

## Kết quả qualification

| Point | VU | Hold s | Requests | RPS | Lỗi % | Checks % | p95 ms | Hold p95 ms | Kết luận |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| [reuse-regression-250](k8s/verification/1k-aws-capacity/3k-aws-20261016T184703Z-fc6326/reuse-regression-250/analysis.json) | 250 | 120 | 50,796 | 238.70 | 0.00787 | 99.99213 | 260.35 | 189.62 | STABLE PASS |
| [reuse-normal-500](k8s/verification/1k-aws-capacity/3k-aws-20261016T184703Z-fc6326/reuse-normal-500/analysis.json) | 500 | 120 | 96,392 | 453.73 | 0.00104 | 99.99896 | 460.87 | 428.74 | STABLE PASS |
| [reuse-long-500](k8s/verification/1k-aws-capacity/3k-aws-20261016T184703Z-fc6326/reuse-long-500/analysis.json) | 500 | 300 | 220,168 | 520.22 | 0.00182 | 99.99818 | 196.38 | 168.53 | STABLE PASS |
| [retained-regression-250](k8s/verification/1k-aws-capacity/3k-aws-20261017T052200Z-952f9c/retained-regression-250/analysis.json) | 250 | 120 | 48,656 | 228.08 | 0.00000 | 100.00000 | 607.64 | 642.36 | STABLE PASS |
| [retained-normal-750](k8s/verification/1k-aws-capacity/3k-aws-20261017T052200Z-952f9c/retained-normal-750/analysis.json) | 750 | 120 | 138,368 | 647.40 | 0.00145 | 99.99855 | 418.21 | 388.57 | INVALID GENERATOR |

Hai lượt 500 đều có generator hợp lệ, coverage đủ 24/24 và 60/60 mẫu hold,
post-smoke PASS, HPA hồi phục tự nhiên, restart delta 0, không ghi nhận OOM hoặc
node pressure. Long500 có p50 **16.52**, p90 **109.24**, p99 **1020.28**, max
**2269.93 ms**; generator CPU peak **83.6%**. Giữ nguyên mọi request lỗi trong mẫu.

Lượt 750 normal có 138.368 request, 647.40 req/s, hai lỗi; HTTP p95 418.21 ms,
hold p95 388.57 ms, checks 99.99855%. Đây là **số liệu quan sát của phép đo INVALID**.
Coverage 24/24, start skew 0.000203 s, post-smoke và recovery PASS; target reasons rỗng.
Cả ba generator thực sự đạt 250 VU, ở target trong 99.17% mẫu hold, nhưng đều bão hòa:

| Generator | CPU đỉnh của máy | Chuỗi mẫu CPU >=90% trong hold | VU |
|---|---:|---:|---:|
| 1 | 98.80% | 10 | 250 |
| 2 | 100.00% | 12 | 250 |
| 3 | 99.50% | 11 | 250 |

Ngưỡng invalid đã khai báo trước là >=90% trong ít nhất ba mẫu liên tiếp khoảng
5 giây. Không bỏ gate này, không giảm JSON validation hoặc tăng think time.
750 long và cả normal/long1000 không chạy vì progression dừng đúng gate.

## Workload, source và topology

Workload SHA256:
`8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.
Bốn GET tuần tự `/menu/danh-muc`, `/menu/san-pham`, `/users/branches/public`,
`/news?limit=100`; full JSON/every-item validation, gzip, think time 3 giây.
Không thay endpoint, payload, pagination, timeout hoặc validation để đạt PASS.
VU không phải RPS và không đại diện toàn bộ người dùng checkout/payment/order/AI.
Whole run **và hold** đều yêu cầu lỗi <2%, checks >98%, p95 <1500 ms; cùng validity,
actual-VU timeline, resource coverage, smoke/recovery và không OOM/restart/pressure.

Baseline: categories23, products118, branches1215, news3; branches 718448 decoded /
80793 gzip bytes. Fleet hoàn tất giữ nguyên item count và decoded size ở cả bốn
route; hash body categories/products/branches khớp lượt trước, riêng News khác.
Sự khác biệt được lưu trong `dataset-continuity.json`; không khẳng định mọi byte
News là bất biến, không reset DB để ép hash khớp hoặc phục vụ fake payload.

Frozen application/public-media content digest:
`ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`.
Image tag `3k-aws-ac88422957e9` là **content digest, không phải clean Git SHA**.
176 file hashes, archive hash, năm amd64 image index/config digest chains và image
archive import hashes được đối chiếu trên cả ba target. Các fleet build lại từ cùng
frozen source nên image index có thể khác giữa các build; không giả vờ là cùng digest.
Actual Node20.20.2, K3s v1.36.5+k3s1, native k6 v2.3.0 với checksum chính thức.

Ba target (một K3s server, hai agents), tối đa ba generator, đều m7i-flex.large,
2 vCPU/8 GiB, ap-southeast-2. Luồng đo: private generator → target1 NodePort30300 →
Kubernetes Gateway Service → Gateway → backend Services thật. Không bypass Gateway
hoặc gọi trực tiếp Pod. Cloudflare chỉ là HTTPS control, không nằm trên data path.
Recipient certificate được đối chiếu AWS Console; commands dùng CMS encrypt/sign.
SG giới hạn NodePort ở generator SG; không public application ingress hoặc SSH.

## Bottleneck đã đo và thay đổi giữ lại

Baseline long500 của phase này FAIL latency: 158.044 request, 372.88 req/s,
p95 2301.58 / hold2494.99 ms, lỗi0.07340%, generator hợp lệ và coverage60/60.
Target1 đạt Linux conntrack **131072/131072**. Trong cửa sổ thu thập, Linux counters
đổi drop617 / early_drop15125; ENA conntrack_allowance_exceeded tăng51, không tăng
bandwidth/PPS allowance counters. Early drop là connection eviction; không cộng
counters Linux và ENA thành số packet mất duy nhất. [AWS giải thích connection tracking](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-connection-tracking.html).

Diagnostics opt-in được bổ sung trước native request/socket assignment: dispatch,
Agent queue, DNS callback, TCP/TLS connect, TTFB, response wait và total; không đọc
body, không retry, không ghi URL/SQL parameters/PII/credentials. Cùng request upstream,
8561/8644 slow-header observations (**99.04%**) có DNS-path là đoạn lớn nhất;20 connect,
63 response-wait. News DNS callback max13912.9 ms trong khi backend request max203.5 ms.
DNS timing bao gồm resolver/threadpool/callback delay, không phải thời gian riêng của
DNS server. Đây là bằng chứng connection churn/conntrack/DNS, không phải kết luận
mọi outlier cùng nguyên nhân hoặc database đã đạt hard ceiling.

**Chỉ giữ `GATEWAY_PROXY_KEEP_ALIVE=false→true` trong AWS overlay**
[`keepalive.yaml`](k8s/overlays/aws-capacity/keepalive.yaml). Gateway500m/request75m,
backend400m, HPA caps, cache5000 ms, DBpoolmax2/idle30000 ms, retries/timeouts không đổi.
Agent có giới hạn128 active/16 idle sockets, LIFO; retire khi socket về pool sau30s,
không cắt response đang chạy. Probe trước/sau: Connection:close8/8 và reuse0/7 →
keep-alive8/8 và reuse7/7; full JSON/gzip giữ nguyên. Upstream reuse đồng thời cho phép
client connection persistence; đây là tác động được ghi nhận của cùng thay đổi.

Long500 sau tuning: conntrack peaks target1/2/3 **9668/8358/3821**, Linuxdrop/earlydrop0,
ENA allowance deltas0. Lượt750: peaks11088/6872/9194, các drop/allowance deltas vẫn0.
Hai quiet500PASS và lower regression xác nhận tuning; không giữ một lucky shortPASS.
Đây không phải formal randomized causal-effect estimate giữa các physical fleet.

Calibration diagnostics chỉ có một off/on250 pair: RPS−0.84%, p95+8.54%, holdp95+9.40%;
không claim zero overhead. Diagnostic-on250 bị observed FAIL do chín HPA samples
không hợp lệ trước tải; giữ nguyên FAIL, sửa preload wait thay vì nới analyzer.
Diagnostics/profiling runs luôn không đủ tư cách qualification; default diagnosticsfalse.

CPU profile30s tại diagnostic250 chỉ ra full JSON/check execution là chi phí lớn:
checks68.88%, JSON unmarshal61%, backgroundGC13.54%, gzip response decode9.23% cumulative
(có overlap).28.28 CPU s/30.06 wall s là khoảng một core, không phải94% của cả máy2vCPU.
Không xác định result-output gzip là bottleneck; không thay output/GC/workload để che
bão hòa. xlarge proposal đã rút vì ngoài Free-plan scope; không provision/nâng plan.
Gateway750m experiment lịch sử vẫn bị bác bỏ; không tăng HPA/CPU/cache/DBpool tùy tiện.

## HPA, tài nguyên và availability

HPA peaks Gateway/Menu/Identity **4/4/3**. Ở hai lượt qualified500, node CPU peak42%,
node RAM peak1263 MiB; cluster sampled CPU1489m/RAM2552 MiB ở long500. Trên mọi retained
capacity point mới, node RAM cao nhất1317 MiB (lượt750invalid); đây là snapshot metrics,
không phải production ceiling. Không ghi nhận unexpected restart/OOM/node pressure.
Raw UID/HPA/Pod/node timelines, CPU/memory/throttle/conntrack/ENA và per-route5s windows
được giữ; missing metrics không thay bằng0. Percentiles gộp dùng toàn bộ numeric
observations trên AWS, không average p95 giữa generators hoặc time windows.

Fleet hoàn tất: **self-healing PASS60/60 HTTP200**, **rolling restart PASS60/60 HTTP200**,
đối chiếu Pod UID mới và cùng immutable image. Scope là một Gateway Pod bị xóa và
same-image deployment restart, không chứng minh node HA hoặc versioned deployment.
Kết quả rolling cũ bị ngắt giữ riêng là INCOMPLETE dù khôi phục probe60/60, vì thiếu
final UID/image proof; kết quả mới đầy đủ không sửa lại lịch sử đó.

## Database, chi phí và cleanup

Chỉ chuyển DB host/port/user/password/database/schema/TLS hiện có theo phép rõ ràng
sang ba target account956035085549; encrypted control và pinned recipient certificate.
Auth/payment placeholders sinh riêng trên AWS; không chuyển real payment/email/auth
secrets. Explicit READ ONLY transaction/five-schema audit PASS. Không seed/migrate/
reset/restore DB hoặc benchmark write workflows. Demo startup flag không phải SQL
permission boundary của platform. Public evidence không chứa DB values hoặc body/PII.

AWS Console trực tiếp xác minh Free plan và credit đủ; không đổi plan/IAM. Các con số
USD dưới đây là **trần sử dụng/dự toán credit**, không phải hóa đơn hoặc số tiền trừ thẻ:

| Fleet | Credit cap bổ sung | Hard lifetime | Kết quả/cleanup |
|---|---:|---:|---|
| [diagnosis](k8s/verification/1k-aws-capacity/3k-aws-20261016T103911Z-004939/README.md) |3.10|175min|baseline/diagnosis; cleanupPASS|
| [500qualification](k8s/verification/1k-aws-capacity/3k-aws-20261016T184703Z-fc6326/README.md) |2.40|120min|two500PASS; expired guests, orphanSG cleanupPASS|
| [completion](k8s/verification/1k-aws-capacity/3k-aws-20261017T052200Z-952f9c/README.md) |2.00|100min|250PASS/availabilityPASS/750INVALID; cleanupPASS|

Lượt hoàn tất dự toán compute<=1.197USD, reserve EBS0.08/IPv40.05/transfer0.60,
tổng1.927<=2.00. Compute upper bound theo toàn bộ sáu máy từ controller start tới
cleanup chỉ **0.803695USD**, vì đã kết thúc sớm; vẫn không phải bill. Trần dự toán
cộng dồn các phase kể cả lịch sử12.4431USD; không suy ra debit credit thực tế từ đó.
Không lưu exact private credit balance vào repository.

Cleanup fleet cuối PASS2026-10-17T06:29:29Z; all-phase verification gồm ENI tại
**2026-10-17T06:30:44Z**: owned active instances0, SG0, EBS0, ENI0, keypairs0.
Local control/tunnel dừng; key/token và private jobs đã xóa, sessionCLOSED.
Phạm vi inventory là mọi known benchmark phase/RunId theo ownership tags trong region,
không khẳng định tài khoản không có tài nguyên không liên quan. Không EKS/RDS/NAT/EIP.

## Kiểm tra cuối và claim dùng cho luận văn

**263 PASS +1 historical SKIP**: backend168 trên native AWS build (Gateway29,
Identity60, Menu45, News34), AWShelpers68/skip1, K8Shelpers24, control3.
Static local22 và AWS14 resource PASS; local runtime không chạy lại để bảo vệ
DataPlatform. Artifact consistency kiểm tra10 completed point, source/workload hashes,
request counts, merged summaries, compact hashes và diagnostic qualification flags.
Secret review/diff/checksum manifest được lưu cùng bằng chứng cuối; delivery commit
chỉ ở local `features_k8s`, không push hoặc thay GitHub authentication.

Lịch sử 250/375/500shortPASS/500longFAIL vẫn giữ ở
[K8S_3K_AWS_CAPACITY_REPORT.md](K8S_3K_AWS_CAPACITY_REPORT.md). Point `reuse-normal-500`
của diagnosis fleet thiếu một generator, chỉ333actualVU, vẫn INCOMPLETE và không được
tính vào hai500PASS. Dữ liệu compact giữ exact numerical observations và hash/count
của bulky original streams; original streams tạm trên AWS đã mất khi delete disks,
không giả vờ còn giữ toàn bộ original HTTP tag stream hoặc response bodies.

**Claim an toàn:** “Triển khai Kubernetes Avengers Coffee tự động co giãn lớp dịch vụ
và duy trì workload public-browse đã kiểm soát ở **500 virtual users**, với hai lần
kiểm chứng độc lập, gồm300 giây giữ tải, đáp ứng các ngưỡng độ trễ và tỷ lệ lỗi đã đặt.”

Không dùng claim1000VU, không gọi750 là applicationFAIL hoặc500 là exact hard ceiling.
