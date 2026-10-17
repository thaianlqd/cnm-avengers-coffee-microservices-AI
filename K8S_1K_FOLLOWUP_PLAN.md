# PLAN 1.000 VU — features_k8s, phase mới sau 750 QUALIFIED

Trạng thái 17/10/2026: **đã thực thi regression250/500/750 vàself-heal/rolling đềuPASS;
**AWS chặn generator6 vìquota16vCPU, fleet đã dọn sạch.1000 NOT RUN****. User yêu cầu tiếp tục mục tiêu 1.000. Kết quả đã đo hiện tại:
500 và **750 repeatably QUALIFIED**, còn **1.000 NOT RUN / NOT QUALIFIED**.
Hai lượt 750 (normal120s/long300s) và cleanup xem
[K8S_750_CAPACITY_REPORT.md](K8S_750_CAPACITY_REPORT.md).
Starting HEAD `1436d50bc10a2d1de4dca2ac590c0a60f267fe59`.

Chỉ worktree `cnm-avengers-coffee-microservices-AI-k8s`, branch `features_k8s`.
**Push đúngfeatures_k8s theo yêu cầu mới; không merge.** Gitidentity/Keychain đổi theo lệnh user cung cấp. Không sửa application code, Dockerfiles,
DataPlatform/branch_thaian, Compose hoặc CPU/RAM Docker Desktop. Không chạy tải trên Mac.

## Sau khi AWS từ chối quota

Lượt3target đã đóng sạch; computeupperbound0,729179626938USD.
Xem [PLAN2target+6generator trongquota16vCPU](K8S_1K_QUOTA_CONTINGENCY_PLAN.md).
Controllerlocal2target có12offlinePASS; user đã chọn **dừngAWS, giữ750/PLANlocal**. Không được launch.
Dự toán gộphai lượt2,995379626938USD trongcùngcap3USD, không xin thêmcredit;
Runtime95phút/topology2target không được duyệt; đề xuất chỉ giữ làm tham khảo local.

## Cơ sở và mục tiêu

| Kết quả đã đo | Hold | RPS | Lỗi | Checks | p95 toàn bài / hold |
|---|---:|---:|---:|---:|---:|
| 750 normal PASS | 120s | 728,94 | 0,00382% | 99,99618% | 92,53 / 73,50 ms |
| 750 long PASS | 300s | 805,05 | 0,00146% | 99,99854% | 93,61 / 77,70 ms |

750 dùng năm generator150VU/máy, CPU peak lớn nhất76,1%, đầy đủ VU/metrics,
post-smoke và natural HPA recovery, restart0/noOOM/pressure; nodeCPU peak35%.
Ba generator250VU/máy trước đó bão hòa CPU; giữ nguyên bằng chứng INVALID lịch sử.
1000/5=200VU/máy có projection CPU~101,47% từ điểm750; **đây là dự báo, không phải
một phép đo1000 thất bại**. Đề xuất tối đa sáu generator:
**167/167/167/167/166/166 VU**, tương đương166/167VU/máy đã đo hợp lệ ở500/3.
Không đảm bảo1000 PASS trước khi đo. Hạ CPU/RAM service không giải quyết JSON
validation ở generator; chưa có lý do thay resources ứng dụng.

Mục tiêu: một normal1000 hold120s và một independent long1000 hold300s đều đủ
qualification. Đây là **public-browse virtual users**, không phải1000 người dùng
thực hoặc workload đặt hàng/thanh toán/đăng nhập.

## Kế hoạch thực thi có gate

1. Sau phép mới: refresh inventory/ENI, public price, AMI/instance eligibility và
   xác minh trực tiếp tài khoản vẫn Free plan. Dùng freshRunId/session/certificates.
   Quota read trước bị AccessDenied;9máy=18vCPU chưa được chứng minh launch được.
   AWS từ chối eligibility/quota thì dừng, cleanup; không đổi plan/IAM/quota/loại máy.
2. Build/test native AWS từ176app/media file hashes và frozen archive; kiểm tra168
   backend tests, image imports trên cả ba target, source/workload/runtime provenance.
   Chỉ DB settings theo phép cũ tới cùng3target của account956035085549/ap-southeast-2,
   control mã hóa/signed/certificate-pinned; placeholders cho startup secrets khác.
   READ ONLY audit, không reset/seed/migrate/restore/writeDB, không gửi realpayment/email/auth secrets.
3. Giữ tuning đã qualified: AWS upstream keep-alive, Gateway500m/request75m,
   backend400m,HPA caps G/M/I4/4/3,min2/1/1,cacheTTL5000,DBpoolmax2/idle30000ms.
   Bốn sequentialGET menu categories/products, publicbranches,news?limit=100;
   fullJSON/every-item validation,gzip,think3s; không giảm payload hoặc endpoint.
4. Xác minh provenance hai750PASS đã commit (gồm300s); so dataset mới với750baseline,
   lưu itemcounts/decodedsize/bodyhash khác biệt. Regression250→500normal bằng3generator.
   Thêm G4/G5 theo measured-inadequacy proof cũ, bootstrap/checksum/fullbaseline;
   regression750normal bằng5generator. Nếu counts/decodedsize thay đổi vật chất,
   bắt buộc thêm fresh750long300s trước1000; không relabel historical runs thành mới.
5. Gateway self-heal và same-image rolling mỗi bài60 requests, kiểm tra newPodUID,
   cùngimage. Scope này không chứng minh nodeHA hoặc version upgrade.
6. Thêm G6 trong topology mới được duyệt; lưu proofhash và rationale166/167VU/máy.
   Chạy1000normal120s bằng6generator. Chỉ đủ mọi gate mới chạy1000long300s độc lập.
   Không vượt1000, không bỏ validation hoặc làm nhẹ workload để ép PASS.
7. Mỗi điểm: actual VU/full timeline, skew<=2s; exact merge toàn bộ numeric observations
   trên AWS (không average p95), whole **và** hold failure<2%,checks>98%,p95<1500ms.
   Generator CPU/RAM/FD/ENA/socket/coverage phải hợp lệ; Pod/HPA/node metrics đầy đủ,
   không OOM/unexplainedrestart/pressure; post-smoke và natural HPA recovery PASS.
   Thu cgroup/throttling/conntrack/kernel/ENA để phân biệt generator và target bottleneck.
8. Bất kỳ gate lỗi: dừng tăng tải, giữ bằng chứng, tự cleanup. Không gọi HTTP PASS
   là capacity PASS khi generator invalid. Chẩn đoán số liệu; chỉ chuẩn bị config
   experiment có căn cứ sau đó, không tự mở lượt AWS khác hoặc vượt cap để retry.
   Không thay code app. Báo maximum thực tế nếu1000 không đủ tiêu chí.
9. Lifecycle deadline110phút, guest termination độc lập, FINISH trên success/failure,
   không mở điểm mới khi còn<30phút. Verify tất cả owned EC2/SG/EBS/keypairs/ENI
   trên các benchmark phases=0; controls dừng, privatekeys/tokens/job artifacts=0.
   Scan secrets/diff/hash/counts/CSV bao gồmgenerator6; cập nhật report/handoff,
   local commit và push riêngfeatures_k8s theo phép mới.

## Dự toán mới — đã được user duyệt trần3USD credit

Refresh read-only **17/10/2026 10:26UTC (17:26 giờ Việt Nam)**: AWS benchmark inventory
và ENI sạch, m7i-flex.large và AMI FreeTierEligible. Điều này chưa thay cho xác minh
Free plan trực tiếp trước launch, cũng không chứng minh EC2 quota đủ9máy.
Giá publicEC2 Linux/shared OnDemand ap-southeast-2 **0,1197USD/máy/giờ**.

| Thành phần | Trần dự toán USD credit |
|---|---:|
| 3 targets + tối đa6generator,110phút | 1,97505 |
| EBS reserve | 0,15 |
| IPv4 reserve | 0,10 |
| Transfer contingency | 0,65 |
| Tổng có dự phòng | **2,87505** |
| Xin phép bổ sung tối đa | **3,00** |

**Chỉ Free plan, dùng promotional credit, không nâng gói/IAM/quota**. Đây là dự toán,
không phải hóa đơn, credit debit đã đo hoặc hạn mức cứng do AWS Billing áp dụng;
controller/guest runtime/topology giới hạn lượng compute. Lũy kế các trần đã được
phép trước14,6431USD; nếu duyệt mới thành17,6431USD, không phải số tiền đã chi.

Scope750 2,20USD/90phút/5generator đã đóng và không tái sử dụng. Đề xuất1000
3USD trước đó bị chọn “Chưa dùng thêm credit; chỉ chuẩn bị local”, giữ nguyên lịch sử.
Theo **mục19 yêu cầu gốc**: “Do not exceed the existing small qualification topology/budget
without asking the user.” User đã cấp phép riêng đúng3USD/110phút/6generator trong session này.
Authorization manifest đã lưu nguyên văn phép mới. Guard vẫn chặn nếu thiếu phép, khác scope hoặc stale preflight.

## Evidence và trạng thái

- Phase mới: [k8s/verification/1000-aws-capacity/3k-aws-20261017T102542Z-08df96](k8s/verification/1000-aws-capacity/3k-aws-20261017T102542Z-08df96).
- Controllers: launch/setup/qualify1000, point/admission<=1000, metrics/correlation/cleanup hỗ trợ đủ6generator.
- Frozen tree `ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`;
  workloadSHA `8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2` không đổi.
- Kết quả chuẩn bị offline xem `local-validation.json`; không phải benchmark1000.
- Đề xuất local-only cũ: `k8s/verification/1k-followup-preflight/20261017T073534Z`.
- [AWS public regional price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-southeast-2/index.csv).
