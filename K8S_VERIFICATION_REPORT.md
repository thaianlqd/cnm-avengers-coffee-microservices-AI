> Latest result 16/10/2026: [AWS capacity report](K8S_3K_AWS_CAPACITY_REPORT.md). 3K NOT QUALIFIED; retained repeatable250VU, single normal375VU PASS (long/repeat not run), long500FAIL. AWS cleanup verified. Local runtime/Socket.IO were not rerun to protect DataPlatform; historical results below remain historical.

# Kubernetes customer demo — verification report

Kiểm chứng 13/10/2026 (Asia/Ho_Chi_Minh). Repository baseline:
`branch_thaian`, HEAD `4a2cabe35dfffc31b1da4317cbfd8c7bf5f6f184`.
Không commit/push/merge/reset/clean. Docker Compose YAML, DataPlatform, mobile và
Web Admin không bị sửa. Báo cáo này thay thế kết luận trước khi cluster được bật;
artifacts local cũ vẫn được giữ trong `k8s/verification/local-results.json`.

## Kiến trúc đang chạy

Docker Desktop Kubernetes v1.36.1, một node arm64 `desktop-control-plane`, Ready,
8 CPU/~8 GB RAM. Metrics Server hoạt động với workaround local
`--kubelet-insecure-tls`. Tám Deployment trong namespace `avengers-coffee`:
Web Customer Nginx, Gateway, Identity, Menu, Inventory, Order, News, AI.
Database ứng dụng là **Supabase/PostgreSQL hiện có** (`K8S_DB_MODE=existing`, TLS).
Redis/RabbitMQ dùng Compose qua `host.docker.internal:6379/5672`. PostgreSQL local
Compose vẫn giữ nguyên volume nhưng không được application sử dụng.
DataPlatform và Compose application layer đã được người dùng dừng trước phiên này.

Public LoadBalancer hoạt động tại `localhost:5175/3000/3005`; không dùng
port-forward cho qualification. Backend dùng Service DNS. Menu/News init-container
chép snapshot ảnh public vào emptyDir, app mount read-only. Không mount node root
hoặc phụ thuộc các đường dẫn hostPath không tồn tại trên node.

## Root causes đã sửa

1. **Service list merge:** strategic merge ghép theo port number, thêm 5175 cạnh
   80 với cùng tên `http`. Ba exposure patch dùng JSON Patch replace toàn bộ
   `/spec/ports`. Web chỉ có `http:5175 → targetPort http`, TCP, LoadBalancer.
2. **Thiếu semantic validation:** schema validator trước đây không bắt duplicate
   list keys. `validate-rendered.rb`/`validate.sh` kiểm tra tám Service, tên/số port,
   targetPort, selector, namespace/labels, probes, resources, config refs, DNS,
   local images, HPA/PDB và media; chạy trước apply. Regression tái tạo duplicate
   port và selector/target mismatch.
3. **Host media path:** `/Users`, `/run/desktop/mnt/host/Users` và `/host_mnt/Users`
   không được node hỗ trợ. Một image arm64 phụ chỉ chứa ~3 MB ảnh public, init
   containers và emptyDir thay thế hostPath. Snapshot hash tránh rebuild nếu ảnh
   không đổi; không đưa repo/.env vào build context media.
4. **Stale binary:** `IfNotPresent` với tag mutable giữ binary cache trên node.
   Generated overlay dùng tag `k8s-local-<image ID 12 ký tự>` và image/config
   fingerprints, bao gồm common ConfigMap và media image. Đã đối chiếu image tag
   của tất cả Pod với Docker image ID. Snapshot chi nhánh giữ đủ 1215 rows,
   718448 decoded bytes → 80793 gzip wire bytes. Rebuild riêng service có code thay đổi.
5. **Startup data writes:** thêm `K8S_DEMO_READ_ONLY=true` để tắt seed News/GiftCard/
   membership, Menu variants migration, voucher outbox worker, AI storage/training/
   model registry. GET news detail không increment view trong mode demo.
6. **Remote repeated reads:** public branch list ~718 KB, products ~116 KB; lặp
   truy vấn qua Supabase làm nghẽn ở tải lớn. Cache public reads tối đa 5 giây, chỉ
   trong demo read-only; coalesce concurrent reads, không cache lỗi/private data,
   không phục vụ stale sau expiry. Candidate cuối serialize/gzip full public JSON
   một lần mỗi snapshot, tránh clone/serialization payload ~718 KB mỗi request.
   Compose bình thường giữ query/JSON behavior cũ.

## Giới hạn dữ liệu phải báo đúng

Lượt deploy đầu được chạy trước khi kiểm tra đủ startup hooks và phát hiện binary
cache. AI storage/registry và Order worker cũ đã có thể chạy; **không thể khẳng định
remote DB hoàn toàn chưa thay đổi bởi các hooks đó**. Đã dừng những Pod này, sửa
hooks và kiểm chứng image mới. Không reset/restore hoặc tự hoàn tác dữ liệu.
News bị chặn mount trước khi vào startup đầu; code demo mới bỏ clear/seed.

`PGOPTIONS` đã thử không có tác dụng với datasource/pooler hiện có (`SHOW
 default_transaction_read_only` trả `off`), nên không dùng nó làm bằng chứng
SQL read-only và đã bỏ cấu hình đó. Không tạo DB read-only role mới. Qualification
chỉ dùng các route public đã audit và SQL metadata/health SELECT; không gửi
orders/payments/wallet/voucher writes hoặc provider requests. Flag demo không
thay thế quyền database; không dùng mode này để kiểm chứng transaction nghiệp vụ.

## Test và validation

| Gate | Kết quả | Bằng chứng |
|---|---|---|
| Static/configured Kustomize | PASS | 22 resources; tám Service, mỗi Service một port đúng |
| Server dry-run | PASS | Tất cả application resources được API server chấp nhận |
| deploy.sh | PASS | Preflight, DB audit, secret apply, rollout, Pod connectivity và HTTP smoke exit 0 |
| Expected workloads Ready | PASS | Baseline chín Pod Ready: Gateway 2; bảy app còn lại 1 |
| Pod DNS/DB/Redis/RabbitMQ | PASS | check-connectivity.sh từ Order Pod |
| Public LoadBalancer | PASS | Web/API/Socket localhost, không port-forward |
| RabbitMQ/Redis protocol | PASS | AMQP connect/auth/close và Redis PING từ Order Pod, không publish/write |
| HTTP smoke | PASS | home, categories/products/branches/news; /users/me thiếu token 401; AI health 200 |
| Browser UI | PASS | Safari: trang chủ, menu category và news list có dữ liệu/ảnh hiển thị |
| Socket public | PASS | WebSocket + polling: chat/notification connect, synthetic room join, reconnect |
| Order HPA | PASS | Không có HPA Order, một replica; chưa qualify nhiều Order Pod |
| Metrics Server/HPA | PASS | CPU/RAM node/Pod và CPU metrics của cả ba HPA |
| HPA scale-up/down | PASS | Peak 4/4/3; về 2/1/1 tự nhiên, không scale thủ công trong qualification |
| Self-healing | PASS | Xóa một Gateway Pod, replacement Ready, 60/60 GET categories HTTP 200 |
| Rolling restart | PASS | Gateway rollout complete, old/new overlap, 60/60 GET categories HTTP 200 |
| Regression | PASS | 283 Nest + 66 Web + 19 AI runtime + 17 environment/render tests = 385 |
| Native images | PASS | Tám application image + media image arm64; chỉ rebuild service thay code |
| Scope/Compose | PASS | Compose config valid; không có diff DataPlatform/Compose/mobile/Admin |
| Git diff/syntax | PASS | diff --check, shell Bash 3.2 syntax, Python syntax |
| Full business login/order/payment | NOT RUN | Ngoài qualification browse read-only; không tạo transaction thật |
| Port-forward fallback | NOT RUN | Không cần vì LoadBalancer hoạt động |
| Multi-Pod Order/Redis outage | NOT RUN | Order luôn một replica, HPA tắt |
| Namespace teardown/Compose rollback | NOT RUN | Giữ cluster demo chạy cho người dùng test; Compose normal startup có thể ghi DB |

Regression breakdown: Gateway 2, Identity 39, Menu 20, Inventory 1, Order 212,
News 9, Web 66, AI health/runtime-config/Redis-memory 19, environment/render 17.
Cache tests chứng minh coalesce, expiry/freshness cap, error recovery, mutation
isolation, entry bounds và Compose bypass. Các test startup chứng minh không seed/
migrate/process worker trong mode demo. Full AI chatbot suite không chạy lại.

## Load và fault evidence

Threshold không đổi: failure <2%, checks >98%, p95 <1500 ms. Profile moderate:
20 → 50 → 100 → 200 → 0 VU, 3 phút + graceful completion; không mặc định 300.
Bốn route thật đều đọc: `/menu/danh-muc`, `/menu/san-pham`,
`/users/branches/public`, `/news?page=1&limit=6`.

| Lượt | Điều kiện | Requests | Failure | p95 | Kết luận |
|---|---|---:|---:|---:|---|
| Smoke đầu | Cluster, trước cache | 40 | 0% | 569.6 ms | PASS |
| Moderate đầu | Chưa cache + fault injection | 9.312 | 8.83% | 2723.5 ms | FAIL |
| Smoke cache | Candidate cache | 48 | 0% | 852.0 ms | PASS |
| Moderate cache/fault | Xóa/restart Gateway khi stress | 9.884 | 11.30% | 1345.4 ms | FAIL transport |
| Moderate container ổn định | Cache, không fault, host.docker.internal | 9.399 | 13.60% | 958.0 ms | FAIL transport |
| Smoke native | darwin/arm64 k6 0.57.0 → localhost | 48 | 0% | 850.4 ms | PASS |
| Moderate native object-cache | Cùng profile/ngưỡng → localhost | 16.032 | 0% | 4614.2 ms | FAIL latency |
| Native Menu/Branch HTTP snapshot | News còn đọc DB mỗi request | 16.092 | 0% | 5140.7 ms | FAIL latency; News p95 6173.7 ms |
| Native full public snapshot | Cache Menu/Branch/News đúng query, gzip/full JSON | 44.608 | 0% | 505.2 ms | PASS |

Hai lượt stress/fault thất bại được giữ nguyên trong artifacts; 60 mẫu availability
riêng không thay thế lỗi của k6. Không coi HTTP sample pass là zero-error khi
stress/fault kết hợp. Benchmark ổn định và fault/availability được đánh giá riêng.
Identity trước optimization có CPU throttling (554/1175 periods trong một mẫu),
không OOM; không tăng resource limit để che bottleneck. Latency per-route cuối:
categories p95 269.9 ms; products 356.0 ms; branches 861.0 ms; news 426.8 ms. HPA tự scale ở CPU pressure thật, không `kubectl scale`
để giả demo. Việc tạm scale xuống 0 trong sửa startup lỗi được ghi là thao tác
khắc phục; không dùng nó làm bằng chứng scale-down HPA.

HPA observed peaks trong hai lượt đầu: Gateway 4, Identity 3, Menu 4; Order 1.
Đã quan sát giảm tự nhiên sau lượt cache/fault: Gateway 4→2, Identity 3→1,
Menu 4→2→1 (desired 1 trước sample cuối). Candidate cuối: 44.608 requests, checks 100%, p95 505.2 ms, average 111.3 ms,
max 3045.3 ms. Không bảo đảm mọi request đều <1.5 s; gate là p95. Final peak
Gateway/Menu/Identity = 4/4/3, Order 1. JSONL observations ghi cả tải/cooldown (31 samples, ~15 s/sample);
replicas đã về tự nhiên Gateway 2, Menu 1, Identity 1. Final self-healing và rolling
restart đều có replacement/overlap, rollout complete và 60/60 HTTP 200.

## Resource policy

| App | CPU request/limit | RAM request/limit | HPA |
|---|---|---|---|
| Web | 25m/200m | 64Mi/128Mi | 1, không HPA |
| Gateway | 75m/500m | 128Mi/256Mi | 2–4, CPU 60% |
| Identity/Menu | 75m/400m | 128Mi/256Mi | Identity 1–3, Menu 1–4, CPU 60% |
| Inventory/News | 75m/400m | 128Mi/256Mi | 1, không HPA |
| Order | 125m/700m | 192Mi/512Mi | 1, không HPA |
| AI | 250m/1000m | 512Mi/1Gi | 1, không HPA |

Initial request 850m/1536Mi. Rolling `maxUnavailable:0/maxSurge:1`, Gateway PDB
minAvailable 1. Scale-down window 120 s, một Pod/60 s; chờ thật, không ép replica.
Một node/Mac không chứng minh node-level HA. AI startup read-only dùng ~133–165Mi
trong các mẫu đã đo; node peak cuối 2191Mi (~2.14 GiB), CPU 3464m (~3.46 cores);
zero Pod restarts/OOM trong final snapshot. Idle node cuối 1812Mi/~229m.

## Commands executed / demo path

```bash
export K8S_DB_MODE=existing
bash scripts/k8s/validate.sh
python3 -m unittest discover -s scripts/k8s/tests -q
python3 scripts/k8s/environment.py audit
bash scripts/k8s/deploy.sh
bash scripts/k8s/status.sh
bash scripts/k8s/smoke.sh
node scripts/k8s/test-public-socket.cjs
bash scripts/k8s/load-test.sh smoke
bash scripts/k8s/load-test.sh moderate
python3 scripts/k8s/observe-hpa.py --seconds 480
bash scripts/k8s/demo-availability.sh healing
bash scripts/k8s/demo-availability.sh rollout
```

Đã chạy server dry-run trực tiếp và trong deploy.sh. Jest chạy --runInBand ở
service đã sửa; AI pytest chạy trong image Python 3.11; source build/Docker build
chạy ở service cần thay đổi. Không chạy lại image Web/Gateway/Inventory khi không
thay source. Đã đối chứng Docker k6 0.57.0 và native darwin/arm64 0.57.0 cùng profile/ngưỡng.
Native binary từ [release Grafana chính thức](https://github.com/grafana/k6/releases/tag/v0.57.0), archive/binary SHA256 verified, được
cache trong gitignored `.tools/k6/0.57.0`; không cài thêm monitoring.

[Demo guide](K8S_DEMO_GUIDE.md) ghi prerequisites, mode existing, Metrics Server,
immutable image/media, load profile, demo thứ tự, cooldown, troubleshooting và
teardown/rollback. [k8s README](k8s/README.md) mô tả policy/config.

Automatic approval đã chặn mount toàn bộ node filesystem; thay bằng narrow path
checks rồi media snapshot. Không thực hiện thao tác bị từ chối. Secrets chỉ đi
vào Kubernetes Secret theo cơ chế hiện có; không lưu secret YAML/log/CLI value.

## Files changed/new

```text
.gitignore
K8S_DEMO_GUIDE.md
K8S_VERIFICATION_REPORT.md
avengers-coffee-system/api-gateway/gateway-root/.dockerignore
avengers-coffee-system/api-gateway/gateway-root/Dockerfile
avengers-coffee-system/api-gateway/gateway-root/src/app.module.ts
avengers-coffee-system/api-gateway/gateway-root/src/health.controller.spec.ts
avengers-coffee-system/api-gateway/gateway-root/src/health.controller.ts
avengers-coffee-system/api-gateway/gateway-root/src/main.ts
avengers-coffee-system/apps/web-customer/.dockerignore
avengers-coffee-system/apps/web-customer/Dockerfile
avengers-coffee-system/apps/web-customer/nginx.conf
avengers-coffee-system/services/ai-service/.dockerignore
avengers-coffee-system/services/ai-service/main.py
avengers-coffee-system/services/ai-service/src/common/db.py
avengers-coffee-system/services/ai-service/tests/test_k8s_health.py
avengers-coffee-system/services/identity-service/.dockerignore
avengers-coffee-system/services/identity-service/Dockerfile
avengers-coffee-system/services/identity-service/src/app.module.ts
avengers-coffee-system/services/identity-service/src/health.controller.spec.ts
avengers-coffee-system/services/identity-service/src/health.controller.ts
avengers-coffee-system/services/identity-service/src/main.ts
avengers-coffee-system/services/identity-service/src/modules/user/membership-contract.spec.ts
avengers-coffee-system/services/identity-service/src/modules/user/user.controller.ts
avengers-coffee-system/services/identity-service/src/modules/user/user.service.ts
avengers-coffee-system/services/identity-service/src/public-browse-cache.spec.ts
avengers-coffee-system/services/identity-service/src/public-browse-cache.ts
avengers-coffee-system/services/inventory-service/.dockerignore
avengers-coffee-system/services/inventory-service/Dockerfile
avengers-coffee-system/services/inventory-service/src/app.module.ts
avengers-coffee-system/services/inventory-service/src/health.controller.ts
avengers-coffee-system/services/inventory-service/src/main.ts
avengers-coffee-system/services/menu-service/.dockerignore
avengers-coffee-system/services/menu-service/Dockerfile
avengers-coffee-system/services/menu-service/src/app.module.ts
avengers-coffee-system/services/menu-service/src/app.service.ts
avengers-coffee-system/services/menu-service/src/demo-startup.spec.ts
avengers-coffee-system/services/menu-service/src/health.controller.ts
avengers-coffee-system/services/menu-service/src/main.ts
avengers-coffee-system/services/menu-service/src/modules/menu/menu.controller.ts
avengers-coffee-system/services/menu-service/src/public-browse-cache.spec.ts
avengers-coffee-system/services/menu-service/src/public-browse-cache.ts
avengers-coffee-system/services/news-service/.dockerignore
avengers-coffee-system/services/news-service/Dockerfile
avengers-coffee-system/services/news-service/src/app.module.ts
avengers-coffee-system/services/news-service/src/health.controller.ts
avengers-coffee-system/services/news-service/src/main.ts
avengers-coffee-system/services/news-service/src/modules/news/news-demo.spec.ts
avengers-coffee-system/services/news-service/src/modules/news/news.controller.ts
avengers-coffee-system/services/news-service/src/modules/news/news.service.ts
avengers-coffee-system/services/news-service/src/public-browse-cache.spec.ts
avengers-coffee-system/services/news-service/src/public-browse-cache.ts
avengers-coffee-system/services/order-service/.dockerignore
avengers-coffee-system/services/order-service/Dockerfile
avengers-coffee-system/services/order-service/package-lock.json
avengers-coffee-system/services/order-service/package.json
avengers-coffee-system/services/order-service/src/app.module.ts
avengers-coffee-system/services/order-service/src/health.controller.spec.ts
avengers-coffee-system/services/order-service/src/health.controller.ts
avengers-coffee-system/services/order-service/src/infrastructure/socket-redis.adapter.ts
avengers-coffee-system/services/order-service/src/main.ts
avengers-coffee-system/services/order-service/src/modules/gift-card/gift-card.service.ts
avengers-coffee-system/services/order-service/src/modules/thanh-toan/wallet-voucher-claim-outbox.service.spec.ts
avengers-coffee-system/services/order-service/src/modules/thanh-toan/wallet-voucher-claim-outbox.service.ts
k8s/README.md
k8s/addons/metrics-server/README.md
k8s/base/ai-service/deployment.yaml
k8s/base/ai-service/kustomization.yaml
k8s/base/ai-service/service.yaml
k8s/base/api-gateway/deployment.yaml
k8s/base/api-gateway/kustomization.yaml
k8s/base/api-gateway/pdb.yaml
k8s/base/api-gateway/service.yaml
k8s/base/configmap.yaml
k8s/base/identity-service/deployment.yaml
k8s/base/identity-service/kustomization.yaml
k8s/base/identity-service/service.yaml
k8s/base/inventory-service/deployment.yaml
k8s/base/inventory-service/kustomization.yaml
k8s/base/inventory-service/service.yaml
k8s/base/kustomization.yaml
k8s/base/menu-service/deployment.yaml
k8s/base/menu-service/kustomization.yaml
k8s/base/menu-service/service.yaml
k8s/base/namespace.yaml
k8s/base/news-service/deployment.yaml
k8s/base/news-service/kustomization.yaml
k8s/base/news-service/service.yaml
k8s/base/order-service/deployment.yaml
k8s/base/order-service/kustomization.yaml
k8s/base/order-service/service.yaml
k8s/base/web-customer/deployment.yaml
k8s/base/web-customer/kustomization.yaml
k8s/base/web-customer/service.yaml
k8s/media/Dockerfile
k8s/overlays/docker-desktop/api-gateway-exposure.yaml
k8s/overlays/docker-desktop/hpa.yaml
k8s/overlays/docker-desktop/kustomization.yaml
k8s/overlays/docker-desktop/order-service-exposure.yaml
k8s/overlays/docker-desktop/web-customer-exposure.yaml
k8s/verification/cluster-results.json
k8s/verification/healing-final.txt
k8s/verification/healing-qualified.txt
k8s/verification/hpa-cache-faults.jsonl
k8s/verification/hpa-container-stable.jsonl
k8s/verification/hpa-initial.jsonl
k8s/verification/hpa-native-object-cache.jsonl
k8s/verification/hpa-qualified.jsonl
k8s/verification/k6-cache-smoke.json
k8s/verification/k6-cache-with-faults-failed.json
k8s/verification/k6-container-stable-failed.json
k8s/verification/k6-initial-failed.json
k8s/verification/k6-initial-smoke.json
k8s/verification/k6-native-menu-branch-serialization-news-bottleneck.json
k8s/verification/k6-native-object-cache-latency-failed.json
k8s/verification/k6-native-smoke.json
k8s/verification/k6-qualified-native.json
k8s/verification/k6-qualified-smoke.json
k8s/verification/k6-serialized-smoke.json
k8s/verification/local-results.json
k8s/verification/rollout-final.txt
k8s/verification/rollout-qualified.txt
load-tests/k6/README.md
load-tests/k6/customer-browse.js
scripts/k8s/build-images.sh
scripts/k8s/check-connectivity.sh
scripts/k8s/common.sh
scripts/k8s/create-secrets.sh
scripts/k8s/demo-availability.sh
scripts/k8s/demo-rollout.sh
scripts/k8s/demo-self-healing.sh
scripts/k8s/deploy.sh
scripts/k8s/environment.py
scripts/k8s/install-k6-local.sh
scripts/k8s/load-test.sh
scripts/k8s/observe-hpa.py
scripts/k8s/port-forward.sh
scripts/k8s/preflight.sh
scripts/k8s/smoke.sh
scripts/k8s/start-infra.sh
scripts/k8s/status.sh
scripts/k8s/teardown.sh
scripts/k8s/test-public-socket.cjs
scripts/k8s/test-socket-redis.cjs
scripts/k8s/tests/test_environment.py
scripts/k8s/tests/test_rendered.py
scripts/k8s/validate-rendered.rb
scripts/k8s/validate.sh
scripts/k8s/verify-local.py
scripts/k8s/wait-ready.sh
```
