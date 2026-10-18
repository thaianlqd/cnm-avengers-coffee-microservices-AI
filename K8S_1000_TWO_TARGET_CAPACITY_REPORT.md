# Kubernetes: kết quả 1.000 VU trên hai target — 18/10/2026

**1.000 VU QUALIFIED: normal 120 giây và lượt độc lập long 300 giây đều STABLE PASS.**

Đây là virtual users cho public-browse workload cố định. Kết quả không đại diện cho đăng nhập, đặt hàng, thanh toán hoặc 1.000 người dùng thực với mọi hành vi. AWS đã được dọn và kiểm tra trước bàn giao.

## Kết quả thực đo

| Point | VU | Hold | Requests | RPS | Lỗi % | Checks % | p95 ms | Hold p95 ms | Kết luận |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| regression-normal-500 | 500 | 120s | 98,996 | 464.94 | 0.00303 | 99.99697 | 263.67 | 185.76 | STABLE PASS |
| regression-normal-750 | 750 | 120s | 154,580 | 731.18 | 0.00323 | 99.99677 | 184.92 | 101.05 | STABLE PASS |
| fresh-long-750 | 750 | 300s | 336,300 | 795.69 | 0.00268 | 99.99732 | 160.03 | 131.50 | STABLE PASS |
| normal-1000 | 1000 | 120s | 195,048 | 915.60 | 0.00615 | 99.99385 | 448.41 | 427.92 | STABLE PASS |
| long-1000 | 1000 | 300s | 428,164 | 1011.45 | 0.00187 | 99.99813 | 422.68 | 435.48 | STABLE PASS |

Cả whole run và hold giữ nguyên gate: lỗi <2%, checks >98%, p95 <1.500 ms. Không loại lỗi hoặc outlier. RPS trong bảng là trung bình toàn lượt, gồm ramp/down. Các quantile được gộp chính xác từ toàn bộ numeric observations trên AWS, không lấy trung bình p95 các shard.

## Tính hợp lệ ở 1.000 VU

### normal-1000

p50 / p90 / p99 / max: **25.08 / 211.59 / 1085.01 / 2337.73 ms**.
Trong hold: lỗi **0.00855%**, checks **99.99145%**. HTTP status counts: `{"200": 195036.0, "504": 12.0}`.
Sáu partition tổng 1.000 VU; start skew **0.000369s**. Đủ metrics hold **24/24**, khoảng cách lớn nhất **5.001295s**.
Generator adequate: `True`; post-smoke: `True`; natural HPA recovery: `True`; restart delta: **0**.

| Generator | CPU peak % | k6 RSS peak MiB | FD peak | RAM available min MiB | Actual VU peak | Hold target fraction |
|---|---:|---:|---:|---:|---:|---:|
| generator1 | 69.50 | 194.48 | 173 | 7079.09 | 167 | 0.99167 |
| generator2 | 77.90 | 207.73 | 173 | 6998.13 | 167 | 0.99167 |
| generator3 | 80.28 | 257.82 | 173 | 6944.63 | 167 | 0.99167 |
| generator4 | 79.36 | 220.33 | 173 | 6988.75 | 167 | 0.99167 |
| generator5 | 73.35 | 191.86 | 172 | 7020.88 | 166 | 0.99167 |
| generator6 | 71.06 | 188.23 | 172 | 7055.94 | 166 | 0.99167 |

Target reasons: `[]`; generator reasons: `[]`.

### long-1000

p50 / p90 / p99 / max: **17.88 / 235.20 / 946.93 / 2632.83 ms**.
Trong hold: lỗi **0.00113%**, checks **99.99887%**. HTTP status counts: `{"200": 428156.0, "504": 8.0}`.
Sáu partition tổng 1.000 VU; start skew **0.000226s**. Đủ metrics hold **60/60**, khoảng cách lớn nhất **5.000761s**.
Generator adequate: `True`; post-smoke: `True`; natural HPA recovery: `True`; restart delta: **0**.

| Generator | CPU peak % | k6 RSS peak MiB | FD peak | RAM available min MiB | Actual VU peak | Hold target fraction |
|---|---:|---:|---:|---:|---:|---:|
| generator1 | 74.25 | 260.45 | 173 | 6838.03 | 167 | 0.99667 |
| generator2 | 77.56 | 205.60 | 173 | 7022.41 | 167 | 0.99667 |
| generator3 | 78.40 | 238.05 | 173 | 7051.56 | 167 | 0.99667 |
| generator4 | 80.10 | 224.46 | 173 | 7043.95 | 167 | 0.99667 |
| generator5 | 85.79 | 221.00 | 172 | 6875.52 | 166 | 0.99667 |
| generator6 | 73.80 | 230.18 | 172 | 7050.27 | 166 | 0.99667 |

Target reasons: `[]`; generator reasons: `[]`.

## Target và HPA

| Point | Node CPU peak % | HPA peak Gateway/Menu/Identity | Cluster CPU peak m | Cluster RAM peak MiB | Restarts | Pending samples |
|---|---:|---|---:|---:|---:|---:|
| regression-normal-500 | 44 | 4/4/3 | 1408 | 2123 | 0 | 0 |
| regression-normal-750 | 60 | 4/4/3 | 1975 | 2124 | 0 | 0 |
| fresh-long-750 | 63 | 4/4/3 | 1951 | 2137 | 0 | 0 |
| normal-1000 | 67 | 4/4/3 | 2250 | 2104 | 0 | 0 |
| long-1000 | 67 | 4/4/3 | 2188 | 2183 | 0 | 1 |

Cluster peak là tổng tại cùng sample, không cộng các peak độc lập. Dữ liệu Pod/node/cgroup/throttling/kernel/ENA và actual VU được giữ trong từng point; giá trị thiếu để trống. Không suy nguyên nhân mọi lỗi/outlier từ tương quan, hoặc cộng counter ở nhiều lớp thành số packet drop duy nhất.

## Self-heal và rolling

- healing: PASS `True`, 60 requests, HTTP statuses `{"200": 60}`, new Pod UID `True`, same immutable images `True`.
- rollout: PASS `True`, 60 requests, HTTP statuses `{"200": 60}`, new Pod UID `True`, same immutable images `True`.

Phạm vi là Gateway Pod và cùng image; chưa chứng minh node HA, control-plane HA hoặc nâng phiên bản.

## Thay đổi và giới hạn phạm vi

Phương án trước cần 18 vCPU và bị quota 16 vCPU từ chối. Lượt này dùng **hai target + sáu generator = 16 vCPU**, cùng `m7i-flex.large`, theo phép riêng của user. Bắt buộc chứng minh lại 750 normal và long trên hai target trước khi lên 1.000. Tải 1.000 chia **167/167/167/167/166/166 VU**; giữ full JSON/every-item validation. Việc thêm generator dựa trên bằng chứng CPU bão hòa ở 250 VU/máy của lượt cũ, không coi dự đoán là đo thực.

**Không sửa code ứng dụng, Dockerfiles, workload, requests/limits, HPA, cache hoặc DB pool trong phase này.** Giữ Gateway limit 500m/request 75m, backend limit 400m; HPA Gateway/Menu/Identity min 2/1/1, max 4/4/3; cache TTL 5000 ms; DB pool max 2, idle 30000 ms; upstream keep-alive đã được qualified ở phase 500.

Workload: bốn GET tuần tự categories/products/public branches/news?limit=100, full JSON validation, gzip, think time 3 giây. Đường tải: native generators → target1 private NodePort 30300 → Gateway Service → backend. Cloudflare chỉ chuyển control được mã hóa, không nằm trên đường tải. Không tác động DataPlatform, branch_thaian, Compose hoặc CPU/RAM Docker Desktop.

## Sự cố thu kết quả normal 1.000

Bộ thu ban đầu không nhận được encrypted result của cả sáu load job. Chưa xác định chắc nguyên nhân giao nhận; tunnel log có một lần mất kết nối rồi tự nối lại. Không dùng hiện tượng này để kết luận service quá tải.

Đã tạm dừng riêng hai process orchestration cha, chấm dứt collector để nhả role locks, rồi thu lại **artifact gốc của chính lượt normal đã chạy**, không chạy lại hoặc sửa workload. Sáu file exit gốc đều 0; exact merge và toàn bộ gate vẫn dùng helper cũ. Sau normal PASS mới chạy long độc lập. Native lifecycle, guest termination và deadline 95 phút không thay đổi. `control-recovery.json`, `normal-1000-recovery.log` và controller recovery lưu đầy đủ dấu vết. Trường đếm process trong diagnostic có thể khớp chính command chẩn đoán, không được dùng làm bằng chứng k6 còn chạy.

## Provenance và dữ liệu

Starting HEAD: `087871c1ad08ffbc6106a96dfd5c15e61a398cd2`.
Frozen 176-file tree: `ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`.
Workload SHA: `8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.
Archive SHA: `baffd60f03e83541849b9f4f73f2a1091e279b63c199a8ec436832a9659bda33`.

Image tag là content digest, không phải clean Git SHA. Native AWS build/test và image proof trên cả hai target; runtime Node/K3s/k6 được lưu riêng. Dataset counts/decoded sizes khớp; khác body hash của News được ghi lại, không reset DB để ép baseline.

Chỉ chuyển cấu hình DB theo phép egress đã duyệt tới account `956035085549`, `ap-southeast-2`, bằng control CMS mã hóa, ký và pin certificate qua EC2 console output. Secret khởi động khác được tạo riêng trên AWS; không chuyển secret payment/email/auth thật. DB audit dùng TLS và READ ONLY; không seed/reset/migrate/restore/write DB.

## Validation và khả năng tái kiểm tra

- Native backend: **168 PASS**. Offline AWS helpers: **76 PASS + 1 historical SKIP**; K8S helpers: **24 PASS**; control: **3 PASS**; snapshot hai target: **12 PASS**. Tổng **283 PASS + 1 SKIP**; fixture không được tính là benchmark.
- Static AWS overlay: 14 resources PASS. Frozen source, workload, compact hashes/counts, request totals, từng generator trong CSV và summary/analysis được đối chiếu.
- Numeric observations và VU timelines đủ để exact merge; full tagged streams chỉ nằm trên ổ AWS tạm đã hủy. Không giữ response bodies hoặc tuyên bố đã giữ mọi raw stream.
- Secret scan, AST, diff, SHA256SUMS và staged-blob checks được thực hiện trước commit/push.

## Credit và cleanup

Phép dùng **cùng tổng cap 3 USD credit**, không phải thêm 3 USD mới; tối đa 95 phút, Free plan, hai target và tối đa sáu generator. Đã xác minh trực tiếp account/Free plan/credit đủ qua AWS Console sau user đăng nhập; không lưu balance. CLI đọc plan bị AccessDenied nên không thay IAM.

Giá preflight 0,1197 USD/máy/giờ. Dự toán new compute ≤1,5162 USD; prior closed compute upper bound 0,729179626938 USD; reserve EBS 0,15 + IPv4 0,10 + transfer 0,50 USD. Tổng dự toán gộp **2,995379626938 USD**. Tổng các cap lịch sử giữ 17,6431 USD; các số này không phải hóa đơn hay credit debit thực đo.
Conservative compute upper bound của fleet mới: **1.237057477586 USD** (77.51 phút, tính bảo thủ cả 8 roles từ đầu controller tới cleanup).
Gộp compute upper bound lượt trước: **1.966237104524 USD**.

Cleanup độc lập lúc `2026-10-18T03:20:22.446602+00:00`: các EC2/SG/EBS/keypairs/ENI thuộc tất cả phase benchmark đã biết đều **0**; private job files **0**, key/token đã xóa, controls dừng, session **CLOSED**. Không claim toàn bộ tài khoản AWS trống. Không nâng quota/IAM/plan.

## Evidence và tài liệu liên quan

Evidence: `k8s/verification/1000-aws-capacity/3k-aws-20261018T015239Z-fcb45f`.

[PLAN](K8S_1K_RESUME_20261018_PLAN.md) · [750 lịch sử](K8S_750_CAPACITY_REPORT.md) · [Lượt quota chặn](K8S_1000_CAPACITY_REPORT.md).

Chỉ nhánh `features_k8s`; không merge hoặc đổi auth/remote/branch_thaian. Historical evidence được giữ nguyên.
