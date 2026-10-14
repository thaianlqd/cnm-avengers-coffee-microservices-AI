# FEATURES_K8S — bàn giao đang dở (14/10/2026)

**RESUMED. Current run 3k-aws-20261014T140730Z-e7a0d2; 250 VU stable once on two generators.**
Code/evidence nằm trên `features_k8s`; không merge, không PR, không push main/branch_thaian.

## Mở lại tối nay

Worktree riêng: `../cnm-avengers-coffee-microservices-AI-k8s`.
Không switch working tree chính đang dùng `branch_thaian`.

```bash
cd ../cnm-avengers-coffee-microservices-AI-k8s
git status --short
git branch --show-current
git fetch --prune origin
git log --oneline --left-right origin/main...origin/features_k8s
```

Nếu origin/main mới khiến histories diverge: STOP, không rebase/reset/merge tự động.
Baseline phase hiện tại: `9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b`.
Đọc `K8S_3K_AWS_CAPACITY_REPORT.md` và evidence trước khi làm tiếp.
Không dùng lại private IP/token/certificate/RunId cũ để bootstrap; fleet cũ đã terminated.

## Đã hoàn thành

- Isolated worktree features_k8s từ latest origin/main; checkpoint commits đã push.
- AWS Sydney: 3 target + 1 generator m7i-flex.large launch thật thành công.
- k3s v1.34.1+k3s1, containerd v2.1.4-k3s2; metrics hoạt động không insecure-TLS workaround.
- Real Gateway/Identity/Menu/News, existing Supabase; startup read-only audit PASS.
- Encrypted CMS control + pinned controller signatures; target certificates authenticated bằng AWS console.
- Native k6 2.3.0 official checksum; images amd64 immutable, private tar distribution + SHA verification.
- NodePort 30300 chỉ generator SG; benchmark data không đi qua Mac/tunnel.
- Fresh DB handshake 1007–1149ms khiến probe connect1000ms fail: đã thêm bounded config
  DB_PROBE_CONNECTION_TIMEOUT_MS (default 1000, max2000), AWS=2000. Query timeout1000/probe4s giữ nguyên.
- Sau fix: Pods Ready/restarts0/HPA metrics PASS; private baseline 80/80 JSON/gzip/HTTP 200.
- Workload SHA256 `dfb9af16b94cc0b22ae53710ece3bde446831fb110a928e7573120bf3ffc4c83` frozen.

## Kết quả chưa đạt — không tiếp tục lên500

250 VU normal60/120/30: 19.856 requests, RPS 94,11, failure0%, checks100%,
p95 3536.66ms, hold p95 3758.64ms, p99 4132.33ms => FAIL latency.
Generator valid: CPUpeak59.9%, FD255/1024, RAMmin~6.14GiB, ENA quota deltas0.
Target CPUpeak19%, restartdelta0, HPApeakG/I/M4/2/2; smoke/recoveryPASS.
Không có stable maximum được xác lập. 3000normal/long1/long2 NOT RUN.

Diagnostic cùng250 có thêm low-rate curl/pod GETs, **không phải qualification run**.
Curl cũng thấy branch tail: p95~2541ms; k6 hold p95~3783ms.
Không kết luận lỗi chỉ do generator, Kubernetes hay Supabase hard ceiling.

## Giả thuyết tiếp theo — CHƯA sửa ứng dụng

DB pool hiện idleTimeoutMillis=5000 bằng cache TTL5000. Sau7s idle:
- pool5000: SELECT1 1211/1269/1278ms, connection bị đóng trước mỗi lần.
- pool30000: cold1356ms, warm194/194ms, connection được giữ.
Đây là isolated read-only diagnostic; **chưa chứng minh cải thiện workload 250**.

Bước tiếp: cân nhắc bounded DB_POOL_IDLE_TIMEOUT_MS (default5000, AWS30000),
giữ max pool 2/cache TTL 5000/payload/workload/HPA/resources; thêm tests rồi commit/push.
Build source exactSHA mới, re-provision fleet mới bằng RunId mới; rerun SAME250.
Chỉ giữ tuning nếu regression + generator/cluster + same-load evidence chứng minh lợi ích.
Nếu250PASS mới chạy500,1000,1500,2000,2500,3000 từng run độc lập. Stopfirst failure.
Nếu3000normalPASS: freeze topology/images/config rồi long60/300/60 x2 độc lập.
Nếu không: thiết lập lower repeatably stable VU với evidence; không claim app ceiling200/250.

## Harness cần lưu ý khi resume

`aws-capacity.py` là disposable eligibility probe, luôn cleanup; không deploy app.
`aws-private-session.py start` tạo fleet/control, chờ certverified và giữ lifecycle tới FINISH/deadline.
Job API encrypt/sign scripts/stdin; plaintext secrets chỉ controller/target, không vào Git/user-data.
`aws-observe.py`, `aws-generator-metrics.py`, `aws-run-generator.py`,
`aws-network-baseline.py`, `analyze-aws-capacity.py` là helpers cho SINGLE generator.
Distributed generators/merged percentiles chưa implement; tuyệt đối không averagep95.
Build/deploy orchestration hiện vẫn cần các bước thủ công theo report; chưa có one-command full qualification.
Template overlay còn k8s-local refs: PHẢI replace immutableamd64 tags + import all nodes + config trướcapply.

## Cleanup và cost

Final verification09:47:43UTC: owned active/stoppedEC2=0, SG=0, EBS=0, keypair=0.
Local relay18084 stopped. Private temporary secret/key/controller files được xóa sau archive.
Initial projected ceiling$3.62; estimated compute/EBS/IPv4~$0.52 excludingunitemizedtransfer,
không phải actualbill. Không giữ EC2 qua đêm.

Giới hạn giữ nguyên: <=$5; target <=4, generators <=3, active fleet <=7;
không EKS/RDS/NATGateway/planupgrade/IAMchanges/destructiveDB/publicNodePort.
**Task còn dở. Chưa qualified3K. User tự finalmerge.**

## Active resume checkpoint

Pool config implemented and pushed as `da8ca6f7`; AWS overlay30000.
New run evidence: `/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI-k8s/k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2`.
Single-generator250 HTTP latency PASS but INVALID GENERATOR (CPU98%).
Two-generator250 STABLE PASS once (p95659.20, hold640.11, 0%errors, checks100%).
Next:500 independent; stop first failure, scale generators only for measured adequacy, max3.
Fleet3targets+2generators currently active; cleanup mandatory before ending.
Historical paused handoff above is retained as previous-state evidence.

## Latest active action

500with2generators INVALID;500with3generators FAIL holdp952233.52ms,
generatorsvalid,restarts0,smoke/recoveryPASS. Do notrun1000+.
Current action: diagnostic500(neverqualification), isolateDB/pod/kernel/network tails.
No Gateway/HPA/cache/payload tuning justified yet. Fleet3targets+3generators active.
