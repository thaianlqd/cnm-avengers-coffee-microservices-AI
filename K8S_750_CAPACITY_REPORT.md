# Kubernetes capacity — 750 VU đã được chứng nhận, 17/10/2026

**750 VU: QUALIFIED, hai lượt STABLE PASS độc lập**, gồm một lượt giữ tải 300 giây.
Mức cao nhất có bằng chứng lặp lại hiện là **750 VU**. **1000 VU: NOT RUN / NOT QUALIFIED**;
không thuộc phạm vi credit được duyệt lần này. Lượt 750 cũ với ba generator vẫn
INVALID GENERATOR trong báo cáo lịch sử, không bị sửa thành PASS.

Chỉ làm trong worktree `cnm-avengers-coffee-microservices-AI-k8s`, branch `features_k8s`.
Starting HEAD: `bca46485ab9389c662406c77dc261e4e3973f806`; commit bàn giao xem `git log -1`.
**Không thay code ứng dụng, Dockerfile, cấu hình service hoặc workload trong phase này.**
Không sửa `branch_thaian`/DataPlatform/Compose/Docker Desktop CPU/RAM trên Mac.
Kết quả giữ local, không push, đổi GitHub authentication hoặc merge.

## Kết quả thực đo

| Point | VU | Hold | Requests | RPS | Lỗi % | Checks % | p95 ms | Hold p95 ms | Kết luận |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| regression-250 |250|120s|50,420|238.02|0.00397|99.99603|359.56|398.32|STABLE PASS|
| regression-normal-500 |500|120s|98,452|460.20|0.00000|100.00000|307.36|239.03|STABLE PASS|
| normal-750 |750|120s|156,996|728.94|0.00382|99.99618|92.53|73.50|STABLE PASS|
| long-750 |750|300s|342,364|805.05|0.00146|99.99854|93.61|77.70|STABLE PASS|

| Phân vị HTTP (ms) | 750 normal | 750 long |
|---|---:|---:|
| p50 |10.17|8.16|
| p90 |59.10|58.26|
| p95 |92.53|93.61|
| Hold p95 |73.50|77.70|
| p99 |755.28|703.65|
| Max |2478.90|2355.88|

Whole **và hold** đều giữ nguyên gate: lỗi <2%, checks >98%, p95 <1500 ms.
Normal hold: lỗi 0.00438%, checks 99.99562%; long hold: lỗi 0.00175%, checks 99.99825%.
Normal có 6 phản hồi 504, long có 5; mọi lỗi/outlier được giữ. PASS không phải zero-error
hoặc mọi request <1500 ms. Quiet runs không cô lập nguyên nhân từng 504; không gán
chúng cho DNS/DB hay service saturation khi chưa có bằng chứng tương ứng.

Cả hai lượt 750 có generator hợp lệ, đủ metrics, post-smoke PASS và HPA hồi phục tự nhiên.
Không ghi nhận OOM, node pressure hoặc unexpected restart; restart delta 0.
Normal coverage **24/24**, long **60/60** hold samples; max gap tương ứng 5.000365/
5.000475s. Start skew 0.000132/0.000611s, nhỏ hơn giới hạn 2s.

## Vì sao lần này đo được 750 hợp lệ

Lượt 750 trước có ba generator đạt CPU 98.80/100/99.50%; observed HTTP gates đạt
nhưng phép đo invalid. Profile lịch sử cho thấy full JSON/check execution là chi phí
lớn của máy phát. Hạ CPU/RAM service không giải quyết phần việc này; Dockerfiles
đã multi-stage, production dependencies và Node production runtime.

Phase này giữ ba target và tăng **tối đa năm generator m7i-flex.large**, theo phép
riêng của user và proof hash từ lượt 750 invalid. 750 chia **5 × 150 VU**, thấp hơn
166/167 VU/máy đã đo hợp lệ ở hai lượt 500. Hai generator bổ sung được xác thực bằng
AWS Console certificate fingerprint, cài native k6 và PASS baseline full JSON/gzip.
Không thay workload hoặc bỏ validation để giảm CPU generator.

| Generator | Normal CPU peak | Long CPU peak | VU thực tế |
|---|---:|---:|---:|
|1|70.18%|71.92%|150|
|2|72.17%|72.22%|150|
|3|73.57%|74.57%|150|
|4|76.10%|73.22%|150|
|5|70.01%|69.27%|150|

Mọi generator đạt 150 VU và duy trì target trong ít nhất 99.17% mẫu hold normal,
99.67% long. Giữ nguyên gate CPU >=90% ít nhất ba mẫu liên tiếp là INVALID, cùng
RAM/FD/ENA/socket/coverage gates. Thông số RSS, RAM available, FD, CPU và actual-VU
của từng máy nằm trong analysis/timelines; không suy actual VU chỉ từ requested VU.

## Workload, source và topology

Bốn GET tuần tự `/menu/danh-muc`, `/menu/san-pham`, `/users/branches/public`,
`/news?limit=100`; full JSON/every-item validation, gzip và think time **3 giây**.
Workload SHA256: `8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.
Không mock/paginate/giảm payload hoặc chuyển sang endpoint nhẹ hơn.

Dataset baseline: categories23/products118/branches1215/news3; branches718448 decoded /
80793 gzip bytes. Item counts và decoded sizes khớp hai 500 PASS lịch sử. Body hashes
categories/products/branches khớp, riêng News khác; lưu đầy đủ khác biệt trong
`dataset-continuity.json`. Không reset DB để ép hash hoặc claim mọi byte dữ liệu bất biến.

176 application/media file hashes vẫn khớp frozen tree
`ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`.
Frozen archive SHA256: `baffd60f03e83541849b9f4f73f2a1091e279b63c199a8ec436832a9659bda33`.
Tag `3k-aws-ac88422957e9` là source-content digest, **không phải clean Git SHA**.
Năm amd64 images được build/test trên AWS, kiểm tra archive/import image index/config
digest chains trên cả ba target; không claim image digests giống các fleet build cũ.
Actual Node20.20.2, K3s v1.36.5+k3s1, native k6 v2.3.0.

Ba target K3s (một server, hai agents) + năm generator, đều m7i-flex.large 2vCPU/8GiB,
ap-southeast-2. Data path: private generator → target1 NodePort30300 → Gateway Service
→ Gateway → backend Services thật. Không bypass Gateway; Cloudflare chỉ làm control
CMS encrypted/signed với certificate đã pin, không nằm trên load path. Không SSH hoặc
public application ingress. Tất cả instance/AMI đều thuộc Free-plan eligible scope.

Giữ nguyên AWS `GATEWAY_PROXY_KEEP_ALIVE=true` đã chứng minh từ phase500; không phải
một thay đổi mới ở phase750. Gateway500m/request75m, backend400m, HPA caps4/4/3,
cacheTTL5000ms, DBpoolmax2/AWSidle30000ms và retries/timeouts không đổi. Không giữ
thử nghiệm Gateway750m lịch sử, không thêm GC/output/validation tuning.

## HPA, tài nguyên và availability

HPA peak Gateway/Menu/Identity **4/4/3**. Node CPU peak normal/long **34%/35%**;
node RAM peak **1282/1281 MiB**; cluster simultaneous sampled CPU **1920m/1837m**,
RAM **2593/2592 MiB**. Đây là sampled peaks của workload đã đo, không phải hard ceiling.
No OOM/node pressure/unexplained restart observed; restart delta 0.

Conntrack peaks target1/2/3: normal **9532/6282/8469**, long **13068/10529/10055**,
so với nf_conntrack_max131072. Linux drop/early_drop/insert_failed và ENA connection/
bandwidth/PPS allowance deltas đều0. `clash_resolve` có tăng và được giữ trong raw
counters; không gọi mọi kernel counter là0 hoặc cộng các lớp thành unique packet drops.

Gateway self-healing và same-image rolling restart đều **60/60 HTTP200 PASS**, newPodUID
và cùng immutable image. Scope một Gateway Pod / deployment restart, không chứng minh
node HA hoặc versioned rollout. CPU/memory/throttle/conntrack/ENA/UID/HPA timelines và
correlation CSV bao gồm đủ **cả năm generator**; request totals khớp merged summaries.

## Database, chi phí và cleanup

Chỉ DB connection settings theo phép trước được chuyển tới ba target tạm account
956035085549 trong ap-southeast-2; encrypted/signed control, recipient fingerprint đã
xác thực. Startup placeholders tạo riêng trên AWS; không chuyển real auth/payment/
email secrets. READ ONLY transaction/five-schema audit PASS; không reset/migrate/
seed/restore DB hoặc benchmark write workflows. Không ghi response bodies/PII/DB values
vào evidence công khai. Không sửa IAM, account plan hoặc quota.

User duyệt tối đa **2.20 USD credit /90 phút /3 target+max5 generator**, chỉ Free plan.
Giá refresh0.1197 USD/máy/giờ: planned compute<=1.4364, EBS reserve0.12, IPv40.08,
transfer0.45; tổng dự toán2.0864 dưới cap2.20. Compute upper bound bảo thủ tính cả
8máy từ controller start tới cleanup **0.897999 USD**; không phải hóa đơn hoặc credit
debit thực tế. Trần dự toán lũy kế đã duyệt14.6431USD; proposal1000/3USD trước chưa
được duyệt và không được cộng như chi phí đã chạy. Không lưu private credit balance.

Native cleanup PASS **2026-10-17T08:51:54Z**. API inventory độc lập sau đó tại
**2026-10-17T08:52:52Z**: mọi knownbenchmark ownership phase/RunId có active instances0,
SG0,EBS0,ENI0,keypairs0. Control/tunnel đã dừng; controller key/token và private jobs0,
sessionCLOSED. Phạm vi không bao gồm tài nguyên không liên quan của tài khoản.
Không tạo EKS/RDS/NAT/EIP. Không còn benchmark đang chạy.

## Validation và claim luận văn

**271 PASS +1 historical SKIP**: backend168 trên native AWS build (Gateway29,
Identity60,Menu45,News34), AWShelpers76/skip1, K8Shelpers24, control3. Static AWS
14resources PASS; guard riêng750 từ chối1000 và generator thứ6, thiếu explicit
approval bị chặn trước control/provision. Không chạy local Docker/K8s runtime.

Artifact consistency PASS cả4points: source/workload hash, full request/check counts,
actualVU partitions, compact stream hashes, numeric summary fields, recovery và CSV
full-generator totals. Final secret scan/diff check/checksum/index verification lưu
cùng evidence. Raw public logs giữ byte-exact, gồm cả.log bị global.gitignore bỏ qua;
scoped whitespace policy chỉ bỏ cảnh báo trailing alignment spaces của raw logs,
không nới qualification gates. Exact numeric observations được giữ compact; bulky
original tag streams tạm trên AWS bị xóa cùng disks, không giả vờ còn giữ mọi rawbody.

**Claim an toàn:** “Triển khai Kubernetes Avengers Coffee tự động co giãn lớp dịch vụ
và duy trì workload public-browse đã kiểm soát ở **750 virtual users đồng thời**,
qua hai lần kiểm chứng độc lập gồm300giây giữ tải, đáp ứng các ngưỡng độ trễ và tỷ lệ
lỗi đã đặt.” Không suy thành750RPS hoặc toàn bộ workflow checkout/payment/order/AI;
không claim1000 hoặc750 là exact hard ceiling.

Evidence: [run directory](k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e),
[qualification](k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e/qualification.json),
[all-phase cleanup](k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e/final-all-phase-cleanup.json).
Lịch sử giữ nguyên: [phase500/750invalid](K8S_1K_CAPACITY_REPORT.md),
[3K historical](K8S_3K_AWS_CAPACITY_REPORT.md). [PLAN đã thực thi](K8S_750_CAPACITY_PLAN.md).
