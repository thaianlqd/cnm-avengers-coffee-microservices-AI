# Checkpoint cuối — 18/10/2026, features_k8s

**1.000 VU QUALIFIED: normal 120s và long 300s đều STABLE PASS.** [Báo cáo mới: hai target, 18/10/2026](K8S_1000_TWO_TARGET_CAPACITY_REPORT.md).
RunId `3k-aws-20261018T015239Z-fcb45f`; AWS đã dọn và kiểm tra độc lập: owned EC2/SG/EBS/keypairs/ENI 0,
private jobs 0, key/token đã xóa, controls dừng, **CLOSED**. Không còn benchmark chạy.

Phép đã dùng: 2 target + tối đa 6 generator `m7i-flex.large`, tối đa 95 phút, chỉ Free plan,
**cùng tổng cap 3 USD credit**, không thêm 3 USD mới; prior closed compute nằm trong cap.
Không mở fleet mới nếu không có phép mới. Không đổi IAM/quota/plan.

Fresh 500 normal → 750 normal + long 300s → Gateway self-heal/same-image rolling →
1.000 normal + long 300s. Đọc `qualification.json`/`progression.json` và analysis từng point;
không dùng fixture để claim capacity. Normal 1.000 đã thu lại artifact gốc sau lỗi giao nhận
control, không chạy lại load hay giảm gate; lịch sử recovery được giữ đầy đủ.

Frozen 176 source files, workload, Dockerfiles, service resources/HPA/cache/DB pool giữ nguyên.
Không tác động DataPlatform/branch_thaian/Compose/Docker Desktop CPU-RAM. Native + offline:
283 PASS, 1 historical SKIP; exact merge trên AWS; CSV/hash/secret/index checks trước commit.

Chỉ commit/push `features_k8s` theo yêu cầu push đã có của user; không merge, force push,
đổi auth/remote hoặc push DataPlatform. Git account phải là `thaianlqd` trước push.
[PLAN đã thực thi](K8S_1K_RESUME_20261018_PLAN.md). Các checkpoint dưới đây là lịch sử.

---

# Checkpoint cuối — dừngAWS, chuẩn bịpushfeatures_k8s,17/10/2026

**1000 NOT RUN / NOT QUALIFIED; maximum repeatably qualified vẫn750 VU.**
User chọn **“Dừng AWS; giữ kết quả 750 và PLAN local”**, rồi yêu cầu **“push lên nhánh đó luôn đi bạn ơi”**.
Chỉpush`features_k8s` tới`origin` đã cấu hình; khôngpush`branch_thaian`/DataPlatform, khôngmerge/đổiremote. GlobalGitidentity/Keychainerase đổi đúng lệnh user; gh login đã verifythaianlqd.

Lượt3target `3k-aws-20261017T102542Z-08df96`:fresh250/500/750 đềuSTABLEPASS;
selfheal/same-imagerollingPASS. AWSrefusedG6 `VcpuLimitExceeded`:18vCPU cần thiết>quota16.
STOP/CLOSED:allownedEC2/SG/EBS/keypairs/ENI0,privatejobs0,key/tokenremoved,controlsstop.
Computeupperbound0,729179626938USD, **không phải hóa đơn/sốcreditđãtrừ**.
[Report](K8S_1000_CAPACITY_REPORT.md),[PLAN](K8S_1K_FOLLOWUP_PLAN.md).

[Contingency2target](K8S_1K_QUOTA_CONTINGENCY_PLAN.md),evidence`3k-aws-20261017T114759Z-224ba7`:
12offlinePASS, **userđãtừchốiAWS, chỉgiữlocal**. NoAWSfolder/fleet/DBtransfer cho mode2target.
Dựtoángộp2,995379626938USD trongcùngcap3USD chỉlàthamkhảo,khôngphéplaunch;
khôngxincreditmới,khôngcộngthêm3USDvàotrầnlũykế17,6431USD. Mọi lượt sau cần phép mới.

Nativebackend168PASS +local111PASS/1historicalSKIP; contingencylocal12PASS riêng.
Frozen176app/mediafiles vàworkloadSHA giữnguyên; sharedharness/appcode/Dockerfiles/serviceconfig khôngsửa.
Khôngthayquota/IAM/Freeplan,khôngchạmDataPlatform/branch_thaian/Compose/DockerDesktopCPU-RAM.
Publicevidence/checksums/secret/diff/indexchecks được hoàn tất trướcpush. Khôngcóbenchmarkcònchạy.

---

# FEATURES_K8S — checkpoint đã đóng, 17/10/2026

**750 VU repeatably QUALIFIED: normal120s và long300s đều STABLE PASS. AWS sạch.**
1000 NOT RUN / NOT QUALIFIED, ngoài scope lần này. Không có benchmark còn chạy.
Worktree riêng `cnm-avengers-coffee-microservices-AI-k8s`, branch `features_k8s`.
Starting HEAD phase750 `bca46485ab9389c662406c77dc261e4e3973f806`; delivery commit xem
`git log -1`. User yêu cầu giữ local: **KHÔNG PUSH, không đổi GitHub auth, không merge**.
Không sửa worktree `branch_thaian`/DataPlatform, Compose hoặc Docker Desktop CPU/RAM.

Đọc [K8S_750_CAPACITY_REPORT.md](K8S_750_CAPACITY_REPORT.md) và
[K8S_750_CAPACITY_PLAN.md](K8S_750_CAPACITY_PLAN.md). Evidence:
`k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e`.

## Kết quả mới

- Regression250 PASS:50420requests,238.02RPS,p95359.56/hold398.32ms,lỗi0.00397%.
- Fresh500 normal PASS:98452requests,460.20RPS,0%lỗi,checks100%,p95307.36/hold239.03ms.
  Hai500PASS lịch sử vẫn giữ nguyên, gồm long300s; không relabel chúng thành freshruns.
- 750normal PASS120s:156996requests,728.94RPS,6HTTP504/lỗi0.00382%,checks99.99618%,
  p9592.53/hold73.50ms,p99755.28ms,max2478.90ms. GenCPUpeak76.1%,coverage24/24.
- 750long PASS300s:342364requests,805.05RPS,5HTTP504/lỗi0.00146%,checks99.99854%,
  p9593.61/hold77.70ms,p99703.65ms,max2355.88ms. GenCPUpeak74.57%,coverage60/60.
- Năm generator150VU/máy, actualVU timeline đầy đủ và skew<=0.000611s. Cả hai750
  genvalid, metrics đầy đủ, postsmoke/naturalHPArecovery PASS, restart0/noOOM/pressure.
- HPA G/M/I4/4/3; nodeCPUpeak35%,nodeRAM1282MiB trên hai750points. Gatewayhealing và
  same-image rolling mỗi bài60/60HTTP200,newPodUID/cùngimage. Không claim nodeHA.

## Scope và nguồn

Phase750 chỉ thay số generator, không thay code app, Dockerfiles, workload hoặc
service resources/HPA/cache/DB settings. Vẫn AWSkeepalivetrue từ phase500 đã chứng minh;
Gateway500m/request75m,backend400m,HPAcaps4/4/3,cacheTTL5000,DBpoolmax2/idle30000ms.
Không tăng thinktime, giảm payload/validation, tuningGC/output hoặc bỏ endpoint.
BốnGET fullJSON/every-item/gzip/think3s giữ workloadSHA
`8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.

176app/media file hashes và archive khớp frozen source tree
`ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`;
tag là contentdigest, không phải cleanGitSHA. Mỗi fleet build lại có image digest riêng,
trong fleet kiểm tra nămimage trên cả3target. ActualNode20.20.2/K3s1.36.5+k3s1/k6v2.3.0.
Dataset counts/decoded sizes khớp historical500; Newsbodyhash khác được ghi rõ, không
resetDB/claim mọi byte bất biến. ReadonlyDBaudit PASS, không seed/migrate/reset/write.
Chỉ approvedDBsettings tới cùng3target account956035085549/ap-southeast-2 theo phép cũ,
CMSencrypted/signed và pinnedcertificate; không realauth/payment/emailsecret.

## Chi phí, cleanup và kiểm tra

User đã duyệt **2.20USDcredit /90min /3targets+max5gens m7i-flex.large, Freeplan only**.
Không đổiplan/IAM/quota. Cumulative authorizedestimate14.6431USD không phải invoice.
Plannedcompute<=1.4364; all8roles-from-start conservativecomputeupperbound0.897999USD,
chưa phải creditdebit/bill. Proposal1000/6gen/3USD vẫn chưa được duyệt và không dùng.

Run750 CLOSED: nativecleanup17Oct08:51:54UTC; độc lậpallknownphases APIverify gồmENI
08:52:52UTC: activeEC2/SG/EBS/ENI/keypairs đều0. Localcontrols/tunnel dừng, key/token
và privatejobfiles0. `.cache/aws-capacity-private/active-750.json` là historicalmetadata,
**không phải fleet đang chạy**. Không in private logs/URLs hoặc reuse keys/certificates.
Các1Kfleets cũ cũng CLOSED, checkpoint cũ không phải lệnh provision.

Validation271PASS+1historicalSKIP:backend168AWS,helpers76/skip1,K8S24,control3;
AWSstatic14PASS. Consistency4completedpoints, exactnumeric merge/source/workload/counts/
compacthashes và full5generator correlation PASS. Secret scan/checksums/diff/index
verification lưu cùng validation/evidence. Không cần rerun backend suite hoặc local
runtime chỉ vì sửa docs/packaging.

History500repeatable/750invalid và375/500shortPASS/500longFAIL giữ nguyên trong
[K8S_1K_CAPACITY_REPORT.md](K8S_1K_CAPACITY_REPORT.md) và
[K8S_3K_AWS_CAPACITY_REPORT.md](K8S_3K_AWS_CAPACITY_REPORT.md). Claim mới an toàn:
Kubernetes tự động co giãn lớp dịch vụ và duy trì governedpublicbrowse750VU, hai lần
kiểm chứng độc lập gồm300s hold, đạt latency/error gates. Không suy thành750RPS,
checkout/payment/order/AI hoặc exacthardceiling750. Không claim1000.

Mọi lượt mới phải có freshinventory/price/eligibility/Freeplan/RunId/sourceprovenance
và phép credit/topology phù hợp. Không tự provision hoặc xin thêm credit nếu user
chưa yêu cầu đổi scope; user sẽ tự xử lý GitHub/merge.
