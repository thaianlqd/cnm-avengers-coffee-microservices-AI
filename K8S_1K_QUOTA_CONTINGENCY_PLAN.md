# PLAN 1.000 VU trong quota16vCPU — user chọn giữ local, dừngAWS

**User đã chọn “Dừng AWS; giữ kết quả 750 và PLAN local”. Không được launch phương án này.1000 chưa chạy.**
AWS đã từ chối generator6 của topology3targets+6generator vì cần18vCPU trong khi
quota tài khoản là16. Lượt đó dừng và cleanup hoàn tất; xem
[K8S_1000_CAPACITY_REPORT.md](K8S_1000_CAPACITY_REPORT.md).
Không đổi quota, IAM hoặc Free plan. User không duyệt giảm target từ3 xuống2 và đã yêu cầu dừngAWS.

## Phương án cụ thể

- **2 target + tối đa6generator m7i-flex.large =8máy/16vCPU**, chỉ Free plan,
  account956035085549,regionap-southeast-2. FreshRunId/session/certificates.
- K3s một server và một agent, cùng source/app images, DB/cache/HPA/service resources
  đã qualified750. Không sửa app code, Dockerfiles, fullJSON/every-item/gzip/think3s.
- 1.000 chia167/167/167/167/166/166VU; từng máy phát vẫn phải qua mọi adequacy gate.
- Ít target hơn có thể tăng CPU/độ trễ; **không suy từ750 trên3target sang2target**.
  Chưa bảo đảm2target chịu được1.000. Không claimnodeHA/control-planeHA.
- DB-only settings đã được phép chuyển tới cùng account/region, nay chỉ2target,
  vẫn CMSencrypted/signed/pinnedcert, startupsecretplaceholders riêng, READONLY,
  không gửi realpayment/email/authsecret, không reset/seed/migrate/writeDB.
- Không dùng Mac để phát tải; không chạmDataPlatform/branch_thaian/Compose hoặc
  DockerDesktopCPU/RAM. Chỉ pushfeatures_k8s; đổi Gitidentity/Keychain theo lệnh user, không merge.

## Progression và kiểm chứng

1. Sau phép đổi topology: refresh giá,AMI/instanceFreeTierEligible, tài khoảnFreeplan
   trực tiếp, all-phaseownedinventory/ENI sạch, source/archive/workloadhashes.
2. NativeAWSbuild và168backendtests; kiểm tra5images trên **cả2target**; DBREADONLYaudit,
   fullJSON/gzipbaseline, baselineHPA2/1/1 và metrics **đủ2nodes**.
3. Fresh500normal bằng3generator. 250 trên3target của lượt đã đóng giữ là lịch sử,
   không relabel thành250 trên2target. Workload córamp60s và baseline đầy đủ trướctải.
4. ThêmG4/G5 theo measuredCPUinadequacy proof lịch sử; fresh750normal120s **và**
   fresh750long300s trên2target bắt buộc, kể cả counts/decodedsize khớp dataset cũ.
5. Gatewayselfheal/same-imagerolling,60requests mỗi bài; thêmG6 trongbound đã duyệt.
6. 1000normal120s phải STABLEPASS hợp lệ rồi mới independent1000long300s.
   Whole vàhold failure<2%,checks>98%,p95<1500ms; actualVUs/skew<=2s, fullgenerator
   CPU/RAM/FD/ENA/socket/coverage, Pod/HPA/node metrics, noOOM/unexplainedrestart/pressure,
   postsmoke/naturalHPArecovery phải PASS. Exactnumericmerge trênAWS đủ6shards;
   không averagep95, bỏendpoint/payload/validation hoặc tăngthinktime.
7. Runtime mới tối đa **95phút**, guestshutdown/terminate và nativecontrollerdeadline.
   Không bắt đầu point khi còn<30phút. Nếu thiếu thời gian/gatefail/AWSrefuse,
   dừng, giữ kết luận thực tế và cleanup; không tự mở lượt thứba.
8. VerifyownedEC2/SG/EBS/keypairs/ENI=0, controlsstop, privatekeys/tokens/jobs=0;
   secret/diff/hash/counts/CSVproof, report/localcommit. Chỉpushfeatures_k8s theo phép mới; khôngmerge/đổiauth.

## Cùng trần3USD hiện có — không xin thêm credit

Giá cần refresh trước launch:0,1197USD/máy/giờ. Dự toán:

| Thành phần gộp toàn phase1K | USD credit |
|---|---:|
| Lượt3target đã đóng: conservativecomputeupperbound | 0,729179626938 |
| Lượt2target:8máy×0,1197×95/60 | 1,516200000000 |
| SharedEBSreserve cảhai lượt | 0,15 |
| SharedIPv4reserve cảhai lượt | 0,10 |
| Sharedtransfercontingency cảhai lượt | 0,50 |
| Tổnggộp códựphòng | **2,995379626938** |
| Trầnphase1K đã duyệt | **3,00** |
| Credit bổ sung xin mới | **0,00** |

Computeupperbound không phải hóa đơn hoặc sốcreditđã trừ. Lũy kế các trần đã được
phép vẫn17,6431USD, không cộng thêm3USD lần nữa. Reserve transfer từ0,65 thành0,50
cho tổnghai lượt; giữEBS0,15/IP0,10. Guard pinSHA/cost/cleanup của lượt đã đóng và
cộng priorcompute vào tổng mới; thiếu/sai bằng chứng, giá tăng hoặc tổng>3 thì chặn.
Mức còn lại trên dự toán rất sát trần; không mở vượtbound để cố làm đủ1000.

## Phần đã làm local, có thể review

Evidence/controller: `k8s/verification/1000-aws-capacity/3k-aws-20261017T114759Z-224ba7`.

- Snapshot private-session riêng cho experiment2target; sharedharness cũ và evidence
  của lượt đã đóng không bị sửa. Default/common3target behavior giữ nguyên.
- Nativeprovision/import/imageproof/metrics/recovery/kernel đúng2target; max6generator.
- Approval mới bắt buộc trước mọi inventory/control/launch mutation; phép3target cũ
  không dùng được. Pendingauthorization: user_approved=false,cap0.
- **12offline tests PASS**:9guard/lifecycle/crypto/2nodemetrics,1CSV đủ6generator,
  2syntheticprogression đảm bảo750normal+long mới và chặn1000long khi1000normalinvalid.
- Crypto/signature/certpinning/bootstrap/add-generator AST giữ nguyên so vớicommon
  harness đã test. Cleanup cảgenerator6, SIGTERM và cleanupfailure/CLOSED gate giữ.
- Synthetic test logs không phải benchmark hoặc1000PASS. Chưa tạoAWS, chưa gửiDBsettings
  bằng mode2target. User đã từ chối phương án này; nếu muốn dùng về sau cần phép mới, refresh toàn bộpreflight/cost/session.
