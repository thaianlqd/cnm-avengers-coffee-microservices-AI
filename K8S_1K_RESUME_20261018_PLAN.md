# PLAN 1.000 VU — đã thực thi ngày 18/10/2026

**1.000 VU QUALIFIED: normal 120s và long 300s đều STABLE PASS. AWS cleanup PASS, session CLOSED.**
[Báo cáo mới: hai target, 18/10/2026](K8S_1000_TWO_TARGET_CAPACITY_REPORT.md). Không còn lượt tải đang chạy; không mở fleet khác theo phép đã đóng.

## Phạm vi được duyệt

User trả lời: “Cho phép 2 target + tối đa 6 generator, 95 phút, cùng tổng trần 3 USD credit”.
Chỉ Free plan, `m7i-flex.large`, account `956035085549`, `ap-southeast-2`; tối đa 8 máy/16 vCPU.
Không đổi plan/IAM/quota. Phương án cũ ba target + sáu generator cần 18 vCPU đã bị AWS từ chối;
không dùng phép topology cũ thay cho phép hai target mới.

Chỉ worktree `cnm-avengers-coffee-microservices-AI-k8s`, branch `features_k8s`;
starting HEAD `087871c1ad08ffbc6106a96dfd5c15e61a398cd2`. Không sửa ứng dụng, Dockerfiles,
workload, service requests/limits/HPA/cache/DB pool, DataPlatform/branch_thaian,
Compose hoặc CPU/RAM Docker Desktop. Không chạy load/build Docker trên Mac.

## Trình tự và gate

1. Xác minh trực tiếp AWS Console: đúng tài khoản, còn Free plan và credit đủ; refresh EC2 price,
   AMI/instance eligibility, inventory/ENI sạch. CLI đọc plan bị AccessDenied, không đổi IAM.
2. Native AWS build/test frozen 176 app/media files; image proof trên cả hai target;
   TLS READ ONLY DB audit, full JSON/gzip baseline. Chỉ chuyển DB settings theo egress approval,
   qua CMS mã hóa/ký/pin cert; startup secrets khác tạo riêng; không real payment/email/auth secrets.
   Không reset/seed/migrate/write DB.
3. Fresh 500 normal → 750 normal 120s → 750 long 300s trên hai target; không suy từ ba target cũ.
4. Gateway self-heal và rolling cùng image; không claim node/control-plane HA.
5. 1.000 normal 120s → lượt độc lập long 300s, sáu generator chia 167/167/167/167/166/166 VU.
   Whole và hold: lỗi <2%, checks >98%, p95 <1.500 ms; actual VU/skew ≤2s;
   CPU/RAM/FD/ENA/socket/metrics coverage đủ trên từng generator; đầy đủ Pod/HPA/node metrics;
   không OOM/unexplained restart/pressure; post-smoke và natural HPA recovery PASS.
6. Exact numeric merge trên AWS, không average percentile; không giảm JSON validation/gzip/payload/think 3s.
   Bốn GET tuần tự categories/products/public branches/news?limit=100 giữ nguyên.
7. Controller và guest termination giữ bound 95 phút. Không mở point khi còn <30 phút.
   Bất kỳ gate fail/refusal/hết bound: dừng tăng tải, giữ evidence, cleanup; không tự mở fleet khác.
8. Kiểm tra owned EC2/SG/EBS/keypairs/ENI 0, private jobs/key/token 0, controls dừng/CLOSED;
   đối chiếu source/CSV/counts/hashes, scan secrets, cập nhật report và commit/push đúng features_k8s.

Sự cố collector của normal 1.000 được xử lý bằng thu lại artifact của chính load gốc;
không chạy lại tải hoặc sửa gate. Bộ điều phối recovery và audit nằm trong evidence.

## Cùng cap 3 USD, không thêm credit mới

| Thành phần dự toán gộp | USD credit |
|---|---:|
| Prior closed compute upper bound | 0,729179626938 |
| New compute tối đa 8 × 0,1197 × 95/60 | 1,5162 |
| EBS reserve | 0,15 |
| IPv4 reserve | 0,10 |
| Transfer contingency | 0,50 |
| Tổng có dự phòng | **2,995379626938** |
| Tổng cap được duyệt | **3,00** |
| Credit cap bổ sung mới | **0,00** |

Đây là dự toán, không phải hóa đơn/credit debit thực đo hay hạn mức Billing cứng.
Giữ lũy kế các cap lịch sử 17,6431 USD; không cộng lại 3 USD lần nữa. Cost upper bounds
sau cleanup nằm trong `cost-summary.json`, báo cáo mới; balance credit không được lưu.

## Evidence và validation

`k8s/verification/1000-aws-capacity/3k-aws-20261018T015239Z-fcb45f`. 283 PASS + 1 historical SKIP gồm native backend 168,
AWS helpers 76 + 1 skip, K8S helpers 24, control 3, snapshot hai target 12.
Fixture ghi rõ không phải benchmark. Artifact consistency, exact merge, compact hashes,
request count/CSV và 176 source hashes được kiểm tra; historical evidence không sửa.

[750 lịch sử](K8S_750_CAPACITY_REPORT.md) · [Lượt quota chặn](K8S_1000_CAPACITY_REPORT.md).
