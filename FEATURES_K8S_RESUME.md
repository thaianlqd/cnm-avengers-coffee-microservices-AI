# FEATURES_K8S — AWS qualification handoff, 14/10/2026

**Experiment hiện tại đã kết thúc và AWS sạch. 3K NOT QUALIFIED.**
Maximum repeatably stable đã đo: 250 VU, được xác nhận bằng hai lượt normal độc lập.
500 valid FAIL latency; không chạy1000–3000. Higher qualification vẫn còn dở.

Worktree riêng: `/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI-k8s`, branch `features_k8s`; tự reuse, bảo vệ `branch_thaian`.
Baseorigin/main: `9eaf3b0b72f88acd7356ad71b2f7373ed3c2f36b`.
Startingfeatures: `978fabba45dd48bb2cc63419b0be8bd66ca492c9`.
Không merge/PR/main/branch_thaian writes. Checkpoints đã push; final docs SHA xem gitlog.

Đọc `K8S_3K_AWS_CAPACITY_REPORT.md` và `k8s/verification/3k-aws-capacity/3k-aws-20261014T140730Z-e7a0d2/qualification.json` trước.
Pool idle default5000/AWS30000 (bounds1000–60000) được giữ; maxpool2/cacheTTL5000.
Probe connect default1000/AWS2000 độc lập. CPU750 experiment bị bác bỏ sau long500
FAIL và đã rollback Gateway500m/request75m/HPA2–4; backend resources/HPA không đổi.
Final250 confirmation STABLE PASS: p95575.40/hold584.29ms.
Images source `dd98fd5a`, filesystem giống `da8ca6f7`; overlay rollback `23b2ed11`.
Giữ mọi INVALID GENERATOR/FAIL/diagnostic helper failure. Không claim500qualification,
application ceiling250 hoặc Supabase hard ceiling.

Next: instrument actual cache miss/business query và Gateway upstream/event-loop
at500; measured tuning, same-load rerun. Không TTL/payload/validation benchmark bypass,
không1000+ trước repeatable valid500PASS. Fresh fleet phải dùng RunId/cost/eligibility/
provenance mới, không reuse oldIPs/certificates/tokens.
Run `3k-aws-20261014T140730Z-e7a0d2` đã cleanup: zero owned active resources, endpoint/control đã dừng.
Estimated incremental compute/EBS/IPv4 $1.9076,
chưa itemize transfer/notactualbill. Hard phase budget$5: reestimate trước khi tiếp tục.
Target<=4/generators<=3; không EKS/RDS/NAT/planupgrade/IAM/destructiveDB/publicappports.
User tự final merge. Historical handoff giữ trong evidence và Git history.
