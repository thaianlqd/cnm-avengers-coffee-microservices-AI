# Customer browse load

Run from the repository root after `scripts/k8s/smoke.sh` passes. Install k6 locally
with `brew install k6`, or use the checksum-verified pinned helper
`bash scripts/k8s/install-k6-local.sh` (macOS arm64, gitignored local binary). The default load uses 20 → 50 → 100 → 200 → 0 VUs over
three minutes. The generator and servers share one Mac; watch Activity Monitor and
`kubectl --context docker-desktop top pods -n avengers-coffee` throughout.

```bash
PROFILE=smoke k6 run load-tests/k6/customer-browse.js
BASE_URL=http://localhost:3000 SUMMARY_FILE=/tmp/k6-customer.json k6 run load-tests/k6/customer-browse.js
# Smaller first load if the laptop is busy:
STEP1_VUS=30 STEP2_VUS=50 STEP3_VUS=100 k6 run load-tests/k6/customer-browse.js
# Optional extra stage, never enabled by default:
STEP4_VUS=300 k6 run load-tests/k6/customer-browse.js
```

Override `WARMUP_VUS`, `STEP1_VUS`, `STEP2_VUS`, `STEP3_VUS`, `STEP4_VUS`,
`THINK_SECONDS`, `SMOKE_VUS`, `SMOKE_DURATION`, `BASE_URL`, or `SUMMARY_FILE`.
Thresholds are failed requests <2%, checks >98%, p95 <1500 ms. A failing threshold
is a failure; do not adjust it to manufacture green results.

Routes were audited in the actual controllers: `/menu/danh-muc`, `/menu/san-pham`,
`/users/branches/public`, and `/news`. No orders, wallets, vouchers, payments, or
provider calls are generated. Authenticated/order scenarios are deliberately
excluded from this first browsing demo.

Watch HPA and Pods in another terminal. Cached reads may be too cheap to reach
the CPU target; scaling is **not guaranteed** by a VU count. Record actual CPU,
replicas, HTTP failures, and latency. Port-forward routes to one selected Pod and
cannot demonstrate Service load balancing; use LoadBalancer URLs for that demo.


For this Docker Desktop setup, qualify using **native k6 → localhost**, the same
public network path as the browser. Container k6 → host.docker.internal has
reproduced transport timeouts under high load even with successful local HTTP
probes. The failed benchmarks remain in `k8s/verification/`; do not use that path
as the default classroom demo until separately qualified.

```bash
bash scripts/k8s/install-k6-local.sh
bash scripts/k8s/load-test.sh smoke
bash scripts/k8s/load-test.sh moderate
# Observe through the load + cooldown without changing replicas:
python3 scripts/k8s/observe-hpa.py --seconds 480
```

Run stable throughput qualification first, then self-healing/rollout availability
as separate measurements. A 60-request availability pass does not cancel k6
failures during combined stress/fault injection.
