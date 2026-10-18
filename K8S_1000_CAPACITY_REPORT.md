> **Mới nhất 18/10/2026: 1.000 VU QUALIFIED: normal 120s và long 300s đều STABLE PASS. AWS đã cleanup, session CLOSED.**
> [Báo cáo mới: hai target, 18/10/2026](K8S_1000_TWO_TARGET_CAPACITY_REPORT.md). Phần bên dưới là lịch sử các phase trước, giữ nguyên kết luận tại thời điểm đó.

# Kubernetes capacity — kết quả phase 1.000 VU, 17/10/2026

**1.000 VU chưa chạy, chưa QUALIFIED. Mức cao nhất đã chứng minh lặp lại vẫn là 750 VU.**

AWS từ chối generator thứ sáu: `VcpuLimitExceeded`, quota hiện có **16 vCPU**;
3 target + 6 generator cần 18 vCPU. Đây là giới hạn AWS, chưa phải kết quả service quá tải ở 1.000 VU.
Controller đã dừng và dọn fleet. User chọn **dừng AWS, giữ kết quả 750 và PLAN local**.
Không tạo lượt AWS khác, không thay quota, IAM hoặc Free plan.

## Các điểm thực đo trong lượt này

| Point | VU | Hold | Requests | RPS | Lỗi % | Checks % | p95 ms | Hold p95 ms | Kết luận |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| regression-250 | 250 | 120s | 45,564 | 215.30 | 0.00000 | 100.00000 | 744.92 | 771.89 | STABLE PASS |
| regression-normal-500 | 500 | 120s | 98,048 | 459.90 | 0.01020 | 99.98980 | 428.28 | 369.77 | STABLE PASS |
| regression-normal-750 | 750 | 120s | 156,140 | 733.69 | 0.00000 | 100.00000 | 143.77 | 75.10 | STABLE PASS |

Whole **và hold** đều qua gate: lỗi <2%, checks >98%, p95 <1500 ms.
Mọi lỗi và outlier được giữ. Hai lượt 750 normal/long300s độc lập đã qualified ở
[phase 750 trước](K8S_750_CAPACITY_REPORT.md); không relabel thành các lượt mới.

## Tính hợp lệ và tài nguyên

| Point | Generators | Generator CPU peak % | Node CPU peak % | HPA peak G/M/I | Hold metrics | Restart delta |
|---|---:|---:|---:|---|---|---:|
| regression-250 | 3 | 42.48 | 19 | 4/3/2 | 24/24 | 0 |
| regression-normal-500 | 3 | 78.18 | 31 | 4/4/3 | 24/24 | 0 |
| regression-normal-750 | 5 | 74.77 | 34 | 4/4/3 | 24/24 | 0 |

Cả ba điểm có generator hợp lệ, actual VU timeline và start skew đạt gate, đầy đủ
Pod/HPA/node metrics, post-smoke và natural HPA recovery PASS. Không có OOM hoặc
node pressure được ghi nhận. Ở 750, node CPU peak 34%; chưa có bằng chứng cần hạ tài nguyên service.
Sáu generator mới chỉ là kế hoạch: thực tế fleet dừng ở **3 target + 5 generator**.
Native k6 → private NodePort30300 → Gateway Service → backend Services; Cloudflare chỉ là control mã hóa.

Gateway self-heal và same-image rolling đều PASS:
- healing: 60 requests, HTTP statuses {"200": 60}, new Pod UID=True, same immutable images=True.
- rollout: 60 requests, HTTP statuses {"200": 60}, new Pod UID=True, same immutable images=True.

Các kiểm tra trên chỉ có phạm vi Gateway Pod/cùng image, không chứng minh node HA hoặc version upgrade.
Kernel/cgroup/ENA và correlation CSV được giữ cho cả ba điểm; không gán mọi 504/outlier cho DNS/DB,
không cộng counters ở nhiều lớp thành số packet drop duy nhất.

## Workload, source và phạm vi thay đổi

Giữ nguyên app code, Dockerfiles, service resources/HPA/cache/DBpool và workload so với starting HEAD
`1436d50bc10a2d1de4dca2ac590c0a60f267fe59`. Chỉ thay harness/controller, tài liệu và evidence.
Bốn GET tuần tự: menu categories/products, public branches, news?limit=100;
full JSON/every-item validation, gzip, think3s. Đây là public-browse VU, không tương đương
1.000 người dùng thực hoặc workload đăng nhập/đặt hàng/thanh toán.
Giữ AWS upstream keep-alive đã qualified từ phase 500; Gateway500m/request75m, backend400m,
HPA G/M/I min2/1/1, caps4/4/3, cacheTTL5000, DBpoolmax2/idle30000ms.

176 app/media file hashes khớp frozen tree `ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`.
Archive SHA `baffd60f03e83541849b9f4f73f2a1091e279b63c199a8ec436832a9659bda33`; workload SHA `8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.
Image tag là content digest, không phải clean Git SHA. Build/test native AWS, xác minh năm image trên cả ba target.
Counts/decoded sizes khớp baseline750; News body hash khác được giữ rõ, không claim dữ liệu byte-identical.
DB audit READ ONLY PASS; chỉ DB settings đã được phép tới cùng ba target trong account956035085549/ap-southeast-2
qua CMS encrypted/signed và certificate pinning. Không gửi real auth/payment/email secrets; không seed/reset/migrate/write DB.

## Validation và PLAN giữ local

- Native AWS backend:168 PASS; offline:111 PASS +1 historical SKIP; tổng lượt này279 PASS +1 SKIP.
- Static AWS overlay:14 resources PASS; cross-file hashes/counts/CSV khớp cả3/3/5 generator của ba điểm thực.
- Exact quantiles gộp mọi numeric observations trên AWS, không average shard percentiles.
- Một invocation control tests chạy song song xung đột cổng18082; giữ log lỗi và chạy tuần tự lại3/3 PASS. Fleet control18084 không bị ảnh hưởng.
- PLAN2target+6generator có12 offline tests PASS, **user không duyệt chạy AWS**. Synthetic logs được gắn nhãn; không phải1.000 PASS.
- Đề xuất gộp hai lượt trong cùng3USD chỉ giữ tham khảo tại [PLAN quota16](K8S_1K_QUOTA_CONTINGENCY_PLAN.md), không được dùng làm phép launch.
- Retained compact numeric points/hash/counts/VU timeline đủ cho exact merge; full tagged streams trên temporary AWS disks đã hủy. Không giữ response bodies.

## Credit và cleanup

User từng duyệt thêm tối đa3USD credit/110phút/3target+max6generator, chỉ Free plan.
Giá public EC2 đã refresh:0,1197USD/máy/giờ; planned compute≤1,97505USD và dự phòng0,90USD.
Free plan xác minh trực tiếp trên AWS Console; không giữ số dư. Read-only GetAccountPlanState API bị AccessDenied, không đổi IAM.
Compute upper bound bảo thủ cho cả8máy từ controller start đến cleanup: **0.729179626938USD**, elapsed45.69phút.
Đây không phải hóa đơn hoặc số credit đã trừ. Trần dự toán lũy kế17,6431USD cũng không phải số tiền đã chi.
Scope credit lượt này đã đóng; user yêu cầu dừng AWS, không tự tái sử dụng phần dự toán còn lại.
Cleanup độc lập `2026-10-17T11:42:32.165797+00:00`: owned EC2/SG/EBS/keypairs/ENI=0; private jobs=0; keys/tokens removed; controls stopped/session CLOSED.
Chỉ kiểm tra các benchmark ownership phases, không claim toàn bộ AWS account trống.

## Bàn giao Git

User sau đó yêu cầu **push features_k8s** và cung cấp lệnh đổi global Git identity/xóa GitHub Keychain credential.
Đã thực hiện đúng các lệnh đó; GitHub CLI xác nhận login `thaianlqd`. Không đổi remote, không merge,
không push branch_thaian/DataPlatform. DataPlatform/Compose/Docker Desktop CPU-RAM và code ở worktree gốc giữ nguyên.
Bốn commit local trước và commit báo cáo này được kiểm tra trước push; lịch sử chứa instrumentation opt-in của phase cũ,
không phải thay đổi app code mới trong phase này. Outgoing history secret scan:1083 blob versions,211 gzip,0 findings.
Final public secret scan, SHA256SUMS, diff và index verification xem evidence.

Evidence: `k8s/verification/1000-aws-capacity/3k-aws-20261017T102542Z-08df96`.
[PLAN](K8S_1K_FOLLOWUP_PLAN.md) · [750 report](K8S_750_CAPACITY_REPORT.md) · [checkpoint](FEATURES_K8S_RESUME.md).
