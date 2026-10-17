> **Follow-up LOCAL ONLY theo xác nhận user (17Oct):** user yêu cầu tiếp tục1000 bằng cấu hình, giữ
> code ứng dụng. Xem [K8S_1K_FOLLOWUP_PLAN.md](K8S_1K_FOLLOWUP_PLAN.md). Harness
> đã hỗ trợ tối đa6generator với guard approval riêng. Chưa được duyệt credit/topology
> mới; user chọn “Chưa dùng thêm credit; chỉ chuẩn bị local”. Không provision/chạy
> AWS; lịch sử kết quả/cleanup bên dưới giữ nguyên. Không hỏi lại credit khi chưa
> có yêu cầu đổi phạm vi từ user.

# FEATURES_K8S — final bounded capacity checkpoint,17/10/2026 ICT

**Lượt đo đã kết thúc; AWS sạch.500 VU repeatably QUALIFIED.750 INVALID GENERATOR.
1000 NOT RUN / NOT QUALIFIED.** User yêu cầu giữ kết quả local, **KHÔNG PUSH GitHub**
và không đổi authentication. Không merge. Worktree riêng `cnm-avengers-coffee-microservices-AI-k8s`,
branch `features_k8s`; startingHEAD `0a9b928c7c596c8772cf83019342f392e96a4d2e`.
Delivery local commit xem `git log -1`; không đổi worktree DataPlatform `branch_thaian`,
Compose, Docker Desktop hoặc RAM/CPU trên Mac.

Đọc [K8S_1K_CAPACITY_REPORT.md](K8S_1K_CAPACITY_REPORT.md) và
[qualification.json](k8s/verification/1k-aws-capacity/3k-aws-20261017T052200Z-952f9c/qualification.json).
Historical375/500shortPASS/500longFAIL giữ ở [báo cáo cũ](K8S_3K_AWS_CAPACITY_REPORT.md).
Không đọc historical "paused/active" notes như lệnh provision mới.

## Kết quả và thay đổi

- 500normalPASS:96392requests,453.73RPS,oneerror(0.001037%),checks99.998963%,
 p95460.87/hold428.74ms.
- 500longPASS300s:220168requests,520.22RPS,fourerrors(0.001817%),checks99.998183%,
 p95196.38/hold168.53/p991020.28ms. Genvalid,CPUpeak83.6%,coverage60/60,
 smoke/recoveryPASS,restart0/noOOM/nodepressure observed. Hai PASS độc lập.
- Fresh250 regressionPASS trong fleet cuối:48656requests,0errors/checks100%,
 p95607.64/hold642.36ms. Dataset itemcount/decodedsize khớp; riêng News bodyhash khác.
- 750normalINVALIDGENERATOR:138368requests,647.40RPS,twoerrors,p95418.21/
 hold388.57ms; HTTPgatesPASS nhưng CPU98.80/100/99.50% và saturationstreak10/12/11.
 Thực250VU mỗi máy, nhưng không qualification.750long/1000normal+longNOTRUN.
- Self-healing và rolling restart fleet cuối:60/60HTTP200 mỗi bài, newPodUID/sameimage.
 Scope GatewayPod/same-image restart; không phải nodeHA hoặc versioned deployment.

KEEP chỉ `GATEWAY_PROXY_KEEP_ALIVE=true` trong AWS overlay `keepalive.yaml`.
Gateway500m/request75m,backend400m,HPA G/M/I4/4/3 caps,cacheTTL5000,DBpoolmax2/
AWSidle30000,timeouts/retries/workload giữ nguyên. Local/Compose default không đổi.
Baselineconntrack131072/131072 và drops/DNS delay đã đo; long500saukeepalive peaks
9668/8358/3821, Linuxdrop/earlydrop0 và ENAallowance0. Không claim DB hard ceiling.
Gateway750m experiment lịch sử rejected; xlarge proposal withdrawn do Freeplan.
Không GC/output/validation tuning, không RAM/CPU/payload/thinktime bypass.

Frozen app/public-media tree SHA256:
`ac88422957e92cbb001543ba91e12ec2fb45948aa5f49c080a5f3f7aad7b9c75`.
Image tag là source-contentdigest, không phải cleanGitSHA. WorkloadSHA256:
`8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2`.
Bốn GET fullJSON/gzip/think3; branches1215/718448decoded/80793gzipbytes.
Actual Node20.20.2/K3sv1.36.5+k3s1/nativek6v2.3.0,3targets+3gens m7i-flex.large.

## Cleanup, chi phí và validation

Ba1K-phase fleets CLOSED:
- `3k-aws-20261016T103911Z-004939`:diagnosis; bounded175min/additionalcap3.10USD.
- `3k-aws-20261016T184703Z-fc6326`:two500PASS;120min/additionalcap2.40USDcredit;
 guests expired,orphanSGcleanup verified17Oct05:20UTC. Interruptedrolling remainsINCOMPLETE.
- `3k-aws-20261017T052200Z-952f9c`:completion;100min/additionalcap2.00USDcredit;
 cleanupPASS17Oct06:29:29UTC,allphaseEC2/SG/EBS/ENI/keypairs0 at06:30:44UTC.

Controller/control/tunnel stopped; privatekey/token/jobs removed,CLOSED. Active metadata
in gitignored `.cache/aws-capacity-private/active-1k.json` is **historical,not active**.
Do not print private logs/URLs or reuse old recipients. No secret copied to Git.
Only approved DB settings transferred to three ephemeral AWS targets account956035085549,
ap-southeast-2; READONLY auditPASS,noDBreset/seed/migration/restore. No real auth/payment/email secrets.
AWS Console verifiedFreeplan; no plan/IAM changes. Cumulative authorizedestimate12.4431USD
is not invoice/card charge; final-fleet conservativecomputeupperbound0.803695USD.

Validation263PASS+1historicalSKIP:backend168AWS,helpers68/skip1,K8S24,control3.
Staticlocal22/AWS14PASS; exactrawnumeric consistency10 completedpointsPASS.
Final validation/secret scan/checksums nằm trong evidence của fleetcuối. Localruntime khôngrerun.

Claim an toàn cho luận văn: Kubernetes tự động co giãn lớp dịch vụ và duy trì
workload public-browse đã kiểm soát ở500VU, hai kiểm chứng độc lập gồm300s hold,
đáp ứng các latency/error gates. Không claim1000 hoặc exact application ceiling500.
Không còn benchmark đang chạy. Mọi lần đo mới cần freshinventory/price/RunId/source
provenance và phép chi phí/topology phù hợp; không tự provision từ checkpoint này.
