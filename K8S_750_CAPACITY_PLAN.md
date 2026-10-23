# PLAN — chứng nhận 750 VU trên features_k8s

**ĐÃ ĐƯỢC DUYỆT:** user cho phép tối đa **2,20USD credit /90phút /3target+max5generator**,
chỉ Free plan cho phase750. **ĐÃ HOÀN TẤT:**750normal và750long300s đều STABLEPASS; cleanup toàn bộ knownbenchmark phases PASS.
Giá/AMI/instance/inventory/ENI và Free plan đã được xác minh lại trước launch.
Mục19 vẫn giữ nguyên: không vượt cap/runtime/topology, không nâng plan/IAM/quota.

Starting HEAD:`bca46485ab9389c662406c77dc261e4e3973f806`. Worktree riêng k8s,
branch features_k8s; không push/merge/đổi GitHub auth. Không tác động DataPlatform,
branch_thaian, Compose hay CPU/RAM Docker Desktop trên Mac.

## Tiến độ thực thi

- [x] User duyệt2.20USDcredit/90min/max5generator, chỉFreeplan.
- [x] Giá, AMI/instance eligibility, inventory/ENI và Freeplan đã xác minh.
- [x] Supervisor và lifecycle có deadline/cleanup đã khởi động.
- [x] Native AWS build/test/import và runtime/source/image/DB-readonly proof (168 backend PASS).
- [x] Regression250 và500 STABLEPASS;500p95307.36ms/hold239.03ms,0%lỗi.
- [x] Self-healing và rolling restart Gateway:60/60HTTP200 mỗi bài,UID mới/cùngimage.
- [x] Thêm generator theo proof, verify baseline và chia750=5×150VU.
- [x] 750normal120s hold STABLEPASS:p9592.53ms/hold73.50ms,generatorvalid.
- [x] 750long300s hold STABLEPASS:p9593.61ms/hold77.70ms,generatorvalid.
- [x] Cleanup AWS/control/secrets, artifact consistency và report/validation sẵn sàng bàn giao local; delivery commit xem gitlog.

## Cơ sở và cấu hình giữ nguyên

500 đã hai PASS độc lập gồm300s hold.750 trước là INVALID GENERATOR:
CPU98.80/100/99.50%, target node peak41%, khôngOOM/restart. Không gọi đó là
serviceFAIL hoặc750PASS; không giảm CPU/RAM service thiếu bằng chứng.

Giữ nguyên application source đã qualified500, Dockerfiles, AWS overlay keep-alive,
resources/HPA/cache/DB pool/timeouts. Chỉ chia tải phát ra tối đa5máy m7i-flex.large,
750=150VU/máy, thấp hơn166/167VU/máy của qualified500. Đây là thiết kế dựa bằng
chứng, không bảo đảm750PASS. Ban đầu3target+1gen; từng máy bổ sung phải có proof
inadequacy/owned-fleet reconciliation và xác thực certificate mới.

## Trình tự thực thi sau khi được duyệt credit/topology

1. **Preflight:** inventory các knownbenchmark phases kể cảENI sạch; freshRunId,
   giá, AMI/instance eligible, Free plan/còncredit, runtime/cost guards. Quota/IAM
   không đổi; nếu actual launch bị từ chối thì dừng và cleanup.
2. **Setup:**3target K3s +ban đầu3generator. Native amd64 build/test/import,
   verify source/archive/image digest trên cả3target. Chỉ DB config theo phép cũ
   sang cùng3target/account956035085549/ap-southeast-2, encrypted/signed control và
   AWS-console pinned certificate. READONLY; không reset/migrate/seed/write DB.
3. **Regression:**250normal →500normal, mỗi lượt120s hold. Đối chiếu dataset và hai
   500PASS lịch sử; nếu item counts/decoded sizes đổi thì cần thêm fresh500long300s.
   Không đủ lifetime để làm đúng thì dừng, không bỏ gate.
4. **Availability:**self-healing và same-image rolling Gateway,60/60probe200 mỗi bài,
   newPodUID/sameimmutableimage. Không suy rộng thành nodeHA.
5. **Đủ generator:**bằng chứng750/3gen bão hòa cùng mức valid166/167VU/máy cho cơ sở
   thêm đến5gen để phát150VU/máy. Verify certificate và fullJSON/gzip baseline từng
   máy mới; exact VU partitions, schedule chung và startskew<=2s.
6. **750normal:**ramp60s →hold120s →down30s, giữ lỗi đầy đủ và naturalHPA recovery.
   Phải STABLEPASS/generatorvalid trước bước7.
7. **750long:**ramp60s →hold300s →down60s. Đây là lần độc lập thứ hai, phải đủ metrics,
   postsmoke và naturalHPA recovery. **Không chạy1000 trong phase này.**
8. **Cleanup/report:**FINISH khi xong hoặc lỗi; tự terminate theo lifetime, kiểm tra
   ownedEC2/SG/EBS/ENI/keypairs=0, dừng localcontrols/xóa credentials/jobs. Secret scan,
   consistency/checksums, update report/checkpoint và commitlocal; khôngpush.

## Gate bắt buộc

Bốn GET tuần tự `/menu/danh-muc`, `/menu/san-pham`, `/users/branches/public`,
`/news?limit=100`; fullJSON/every-item checks, gzip, think3s. Không giảm payload,
validation hoặc thêm thinktime. Whole **và hold**:failure<2%,checks>98%,p95<1500ms.

Từng generator có actualVU timeline đầy đủ,>=95%hold samples ở target; CPU>=90%
trong>=3sample liên tiếp thì INVALID; giữ RAM/FD/ENA/socket/coverage/skew gates.
Đủ HPA/Pod/node metrics, khôngOOM/unexplainedrestart/nodepressure, postsmokePASS,
recovery tự nhiên. CPUgeneratorinvalid không được gọi appFAIL hoặcqualifiedPASS.
Một bước không hợp lệ thì dừng; một service-config experiment mới chỉ cân nhắc khi
có measuredtargetbottleneck và còn thời gian trong cùng cap, phải regression lại.

## Chi phí dự kiến — đã được duyệt cho phase750

Refresh17Oct07:48UTC:0.1197USD/m7i-flex.large/giờ, AMI+instanceeligible.
Tối đa8máy ×90phút:compute<=**1.4364USD**; reserve EBS0.12,IPv40.08,transfer0.45,
tổng2.0864; đề nghị trần **2.20USDcredit**, chỉFreeplan. Giữ nguyênplan/IAM/quota.
Trần dự toán lũy kế đã duyệt14.6431USD, không phải hóa đơn hoặc tiền trừ thẻ.
Proposal1000/6gen/3USD trước vẫn chưa được duyệt và không dùng cho phase750.

Bộ controller chỉ cho tối đa750VU/5gen và manifest đã ghi đúng phép mới `user_approved=true`,
credit cap2.20. Proposal1000 trước không phải phép chạy1000:
[k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e](k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e).

Kết quả mới: **750repeatablyQUALIFIED**, hai lượt độc lập normal120s vàlong300s.
750INVALIDGENERATOR trước được giữ nguyên trong báo cáo lịch sử;1000NOTRUN.
Chi tiết:[K8S_750_CAPACITY_REPORT.md](K8S_750_CAPACITY_REPORT.md).
