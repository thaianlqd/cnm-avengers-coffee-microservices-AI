# Demo Kubernetes Avengers Coffee trên Mac M1 Pro

Triển khai này thêm một cách chạy Kubernetes; Docker Compose cũ vẫn dùng được.
Đã triển khai trên Docker Desktop Kubernetes arm64, node Ready với 8 CPU/~8 GB RAM.
Database ứng dụng là Supabase/PostgreSQL hiện có; Redis và RabbitMQ giữ Compose.
Kết quả từng lượt tải và giới hạn nằm trong [verification report](K8S_VERIFICATION_REPORT.md).
Final qualification: 44.608 requests, 0 lỗi, p95 505 ms; HPA peak Gateway/Menu/Identity
4/4/3 và về tự nhiên 2/1/1. Self-healing/rolling restart đều 60/60 HTTP 200.

## Kiến trúc để giải thích với giảng viên

Trước Kubernetes:

```text
Customer → Web Customer → API Gateway container
                              → một container mỗi service
                              → database hiện có / Redis / RabbitMQ
```

Sau Kubernetes:

```text
Browser localhost:5175 → Web Customer (Nginx production)
            localhost:3000 → API Gateway Service → Gateway Pods x2..4
                                                ├→ Menu Service → Pods x1..4
                                                ├→ Identity Service → Pods x1..3
                                                ├→ Inventory Service → Pod x1
                                                ├→ Order Service → Pod x1
                                                ├→ News Service → Pod x1
                                                └→ AI Service → Pod x1
            localhost:3005 → Order Service → Socket.IO namespaces

Pods → database Supabase/PostgreSQL hiện có (TLS)
     → host.docker.internal:6379 → Compose Redis
     → host.docker.internal:5672 → Compose RabbitMQ
Menu/News init-container → snapshot ảnh public → volume đọc-only của từng Pod
```

Service DNS cung cấp discovery và phân phối kết nối tới các Pod Ready. HPA tăng
số Pod theo CPU thực đo bởi Metrics Server. Redis adapter phân phối event giữa
Socket.IO servers; Service Order có `ClientIP` affinity cho polling. Order chưa
bật HPA vì cần kiểm chứng hai Pod thật trước. Một node không chứng minh được
khả năng sống sót khi toàn bộ node/Mac/Docker Desktop ngừng chạy.

## Chuẩn bị trước buổi demo

Mở Docker Desktop → Settings → Kubernetes → Enable Kubernetes. Chờ cluster Ready;
không cần đổi current context vì scripts luôn chỉ định `docker-desktop`.
Deployment dùng tag local gắn với image ID (`k8s-local-<12 ký tự>`) để tránh node
chạy binary cache khi `k8s-local` được rebuild. Không đổi sang amd64 hoặc kéo image
`avengers/*` từ Docker Hub. Helper tự tạo tag từ image đã build; chỉ rebuild các
service có code thay đổi. Menu/News dùng init-container với snapshot ảnh public,
không cần hostPath `/Users` trên node.

Chạy từ thư mục gốc repository:

```bash
kubectl --context docker-desktop get nodes
kubectl --context docker-desktop top nodes
kubectl --context docker-desktop top pods -A
```

Nếu metrics chưa có, làm theo [hướng dẫn Metrics Server](k8s/addons/metrics-server/README.md).

Giữ nguyên root `.env` và credentials hiện có. **Máy này dùng database remote,
không phải PostgreSQL local Compose.** Luôn đặt mode trước preflight/audit/deploy:

```bash
export K8S_DB_MODE=existing
bash scripts/k8s/preflight.sh
python3 scripts/k8s/environment.py audit
```

Audit dùng SQL chỉ đọc để kiểm tra connection/năm schema, không restore hoặc seed.
Không reset/recreate local DB và không đổi `POSTGRES_*` để cố tạo database demo.
PostgreSQL Compose có thể giữ chạy nhưng không phải datasource của ứng dụng.
Metrics Server đang hoạt động với `--kubelet-insecure-tls` do certificate kubelet
local; đây là ngoại lệ cho Docker Desktop, không áp dụng production.

```bash
# Image đã build thì bỏ qua bước build; chỉ chạy khi đổi code/public VITE config.
bash scripts/k8s/build-images.sh
# Infra đã healthy thì không cần restart.
bash scripts/k8s/start-infra.sh
python3 scripts/k8s/environment.py audit
# Chỉ chuyển chế độ sau khi audit PASS và metrics hoạt động.
docker compose stop web-customer api-gateway identity-service menu-service inventory-service order-service news-service ai-service
bash scripts/k8s/validate.sh
bash scripts/k8s/deploy.sh
bash scripts/k8s/smoke.sh
bash scripts/k8s/status.sh
```

Lệnh stop trên chỉ dừng các ứng dụng customer để tránh trùng port, worker và event;
không dừng database, Redis, RabbitMQ, Admin hoặc DataPlatform. Nếu deploy lỗi sau
bước stop, rollback ngay bằng các lệnh ở cuối tài liệu.

Mở `http://localhost:5175`, xem menu, danh mục và tin tức. Kiểm tra Network tab:
API đi `localhost:3000`, Socket.IO đi `localhost:3005`, không dùng Service DNS trong
trình duyệt. Kiểm tra màn hình đăng nhập; không cần tạo tài khoản/đơn thật để demo
scaling. `smoke.sh` chứng minh `/users/me` trả 401 khi thiếu token, không thay thế
kiểm chứng đăng nhập thành công bằng tài khoản demo của bạn.

Nếu LoadBalancer chưa gán localhost, dùng terminal riêng:

```bash
bash scripts/k8s/port-forward.sh
```

Port-forward phục vụ truy cập tạm và gắn vào một Pod; **không** dùng nó làm bằng
chứng load balancing/HPA. Sau khi Pod đó bị thay, restart helper. Khi cần đổi
port forward, frontend cũng phải build với URL public tương ứng.

## Kịch bản giảng viên 5–8 phút — sau khi đã chuẩn bị cluster

Mở browser ở Web Customer và ba terminal. Dùng k6 **native → localhost**, cùng
đường truy cập browser. Không dùng generator container `host.docker.internal` cho
bài demo mặc định vì đã quan sát timeout ở tải cao trên đường đó.

```bash
bash scripts/k8s/install-k6-local.sh
```

Helper pin k6 0.57.0 macOS arm64 từ release Grafana và xác minh archive/binary
SHA256; lưu trong gitignored `.tools/k6`, không cài vào hệ thống. Có thể dùng k6
đã cài bằng Homebrew, nhưng benchmark phải ghi version. `K6_BIN` cho phép chỉ rõ
binary. Image generator Docker chỉ dùng cho chẩn đoán riêng.

Terminal 1 — hiển thị Pod/HPA theo thời gian:

```bash
while true; do
  kubectl --context docker-desktop -n avengers-coffee get pods,hpa
  sleep 3
done
```

Terminal 2 — metrics trước tải, rồi tải thật trong khoảng ba phút:

```bash
kubectl --context docker-desktop -n avengers-coffee top pods
bash scripts/k8s/load-test.sh smoke
bash scripts/k8s/load-test.sh moderate
```

Terminal 3 — sau lượt k6 ổn định, chứng minh tự chữa và rolling update:

```bash
bash scripts/k8s/demo-availability.sh healing
bash scripts/k8s/demo-availability.sh rollout
kubectl --context docker-desktop -n avengers-coffee top pods
```

| Thời gian | Màn hình cần chỉ | Kết quả quan sát mong đợi |
|---|---|---|
| 0:00–0:30 | Browser menu/news + terminal Pod | Web Nginx hoạt động; Gateway ít nhất hai Pod Ready |
| 0:30–3:30 | k6, HPA, `top pods` | CPU tăng; Gateway và ít nhất Menu/Identity tăng replica nếu vượt CPU target |
| Sau lượt tải | Self-healing | Một Gateway Pod mất, Pod tên mới xuất hiện; 60 mẫu browse tiếp tục HTTP 200 |
| Sau self-healing | Rolling restart | ReplicaSet mới thay Pod lần lượt; 60 mẫu browse HTTP 200; rollout complete |
| 3:30–5:00+ | HPA sau tải | Replica dần giảm sau cửa sổ ổn định 120 giây và policy giảm một Pod/60 giây |

Scale-down có thể cần lâu hơn năm phút vì cửa sổ metrics và stabilization; tiếp
tục quan sát thay vì ép replica để giả kết quả. Load nhẹ có thể không vượt CPU
target. Nếu HPA không tăng, xem metrics và bottleneck thật; không coi số VU hoặc
HTTP 200 là bằng chứng scaling. Không chỉnh threshold sau chạy để báo pass.

Load script chỉ GET các route có thật: menu danh mục/sản phẩm, chi nhánh public,
news list. Không gọi AI, thanh toán, voucher, wallet hoặc tạo đơn. Mặc định tối đa
200 VU; tùy chọn 300 theo [hướng dẫn tải](load-tests/k6/README.md).

## Kiểm chứng realtime trước khi nghĩ đến Order HPA

Test hai server local dùng gateway/adapter thật, dữ liệu synthetic:

```bash
cd avengers-coffee-system/services/order-service
npm run build
cd ../../..
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 node scripts/k8s/test-socket-redis.cjs
```

Đã kiểm chứng WebSocket và polling, room conversation/support/personal/workforce/
tracking, event qua Redis và disconnect/reconnect. Chưa kiểm chứng hai Pod qua
Docker Desktop LoadBalancer, affinity, Redis outage/recovery và client UI thật.
Không scale Order >1 trong demo mặc định. Không có HPA Order trong manifests.
RabbitMQ consumer/outbox và luồng thanh toán cũng cần qualification riêng trước
khi tuyên bố toàn bộ Order an toàn ở nhiều replica.

## Cấu hình và resource để trình bày

| Deployment | Replica ban đầu | CPU request/limit | RAM request/limit | HPA |
|---|---:|---|---|---|
| Web Customer | 1 | 25m / 200m | 64Mi / 128Mi | Không |
| Gateway | 2 | 75m / 500m | 128Mi / 256Mi | 2–4, CPU 60% |
| Identity | 1 | 75m / 400m | 128Mi / 256Mi | 1–3, CPU 60% |
| Menu | 1 | 75m / 400m | 128Mi / 256Mi | 1–4, CPU 60% |
| Inventory | 1 | 75m / 400m | 128Mi / 256Mi | Không |
| Order | 1 | 125m / 700m | 192Mi / 512Mi | Chưa bật |
| News | 1 | 75m / 400m | 128Mi / 256Mi | Không |
| AI | 1 | 250m / 1000m | 512Mi / 1Gi | Không |

Tổng request ban đầu: **850m CPU, 1536Mi RAM**; giới hạn không phải dung lượng
RAM được cấp ngay. HPA và surge cần thêm headroom. Đây là mức khởi đầu chưa đo
Peak thực tế được ghi trong report; `kubectl top`/OOM quyết định có cần tăng. Không cài
Prometheus/Grafana vào baseline. Gateway có PDB `minAvailable: 1`; không hard
anti-affinity trên một node. Rollout giữ `maxUnavailable: 0`, `maxSurge: 1`.

Liveness chỉ kiểm tra process, không phụ thuộc PostgreSQL/provider. Readiness
backend kiểm tra database read-only có timeout; Order còn yêu cầu Redis adapter
Ready. Web readiness kiểm tra file `index.html`. Shutdown hooks NestJS/Uvicorn,
preStop 5 giây và grace period 30 giây (AI 60 giây) hỗ trợ drain.

## Giới hạn chỉ đọc và freshness của demo

`K8S_DEMO_READ_ONLY=true` tắt startup seed News/GiftCard/membership, migration
variants Menu, outbox worker và AI storage/training/registry. News detail không
increment view trong mode này. Đây là demo browse/scaling: không bấm checkout,
wallet, voucher, form ghi dữ liệu hoặc chat AI. Không có credential DB read-only
riêng; flag không thay thế quyền SQL, và smoke/load chỉ dùng route đã audit.

Menu/danh mục/chi nhánh/news public có cache HTTP tối đa **5 giây**, chỉ trong demo read-only,
để tránh lặp truy vấn lớn qua Supabase và serialize/gzip full JSON một lần mỗi
snapshot. Dữ liệu không bị cắt bớt. Mỗi cache miss/expiry chạy query thật;
request đồng thời cùng snapshot được gộp, lỗi không cache, không phục vụ stale sau
expiry khi query lỗi. Không cache auth/private/admin data. News cache phân biệt page/limit/category. TTL có thể đặt 0 bằng sửa
`PUBLIC_BROWSE_CACHE_TTL_MS` trong ConfigMap; kết quả benchmark phải nêu rõ policy.
Workflow Compose bình thường không bật cache này.

Trên lượt tải đầu chưa có cache, HPA đã scale nhưng ngưỡng HTTP thất bại;
report giữ kết quả đó và đối chiếu lượt cuối, không thay threshold để báo pass.

Không chạy benchmark ổn định và fault injection đồng thời. Hai lượt stress có
xóa/restart Pod đã có lỗi transport mặc dù 60 mẫu availability riêng đều pass;
report giữ giới hạn này. Benchmark tải ổn định, fault/availability và cooldown
được báo tách biệt; không tuyên bố zero-error dưới stress/fault kết hợp.

## Troubleshooting

```bash
bash scripts/k8s/status.sh
kubectl --context docker-desktop -n avengers-coffee describe pod POD_NAME
kubectl --context docker-desktop -n avengers-coffee logs deployment/SERVICE_NAME --tail=100
```

| Triệu chứng | Kiểm tra / xử lý |
|---|---|
| ImagePullBackOff | Build tag `avengers/<name>:k8s-local`, inspect arm64, bảo đảm Kubernetes dùng image store nhìn thấy local images; không đổi pullPolicy thành Always |
| CrashLoopBackOff | Logs/previous logs, biến bắt buộc, DB role/password/schema, Redis adapter; không copy log chứa key vào Git |
| Pending | `describe pod`: CPU/RAM không đủ, surge thiếu headroom hoặc init media chưa hoàn tất; giảm tải/tắt dịch vụ không cần bằng quyết định rõ ràng |
| Probe fail | GET `/health/live`, `/health/ready`; readiness DB fail không có nghĩa process phải restart; kiểm tra DB mode/TLS/host port |
| Metrics/HPA `<unknown>` | `top nodes`, `top pods`, Metrics Server logs/APIService; requests CPU đã có; chờ có mẫu |
| host.docker.internal không resolve | Exec Order Pod, `node -e 'require("dns").lookup("host.docker.internal",console.log)'`; kiểm tra Docker Desktop host gateway thực tế |
| Host bridge bị chặn | Kiểm tra published ports/host firewall; export `K8S_INFRA_HOST=<IP host đã kiểm chứng>`, tạo config lại và restart application Pods; không chuyển DB vào Kubernetes để né lỗi |
| Init media fail | `kubectl logs POD -c public-media`; chạy `python3 scripts/k8s/environment.py media`. Snapshot chỉ chứa hai thư mục ảnh public, không có .env; rebuild khi đổi ảnh |
| Port collision | `lsof -nP -iTCP:3000 -sTCP:LISTEN`, kiểm tra Compose customer app còn chạy; tương tự 5175/3005 |
| OOMKilled | `describe`, `top`, mức peak và số job; tăng limit có đo đạc và xét tổng RAM 8 GB; AI giữ một Pod |
| Rebuild nhưng Pod chạy image cũ | Chạy deploy.sh để tag immutable và fingerprint thay đổi; rollout restart trên tag cũ không đủ. So sánh image Pod với `k8s-local-<ID>` và record imageID |

Sau khi chỉnh `.env`/host config:

```bash
bash scripts/k8s/create-secrets.sh
kubectl --context docker-desktop -n avengers-coffee rollout restart deployment
bash scripts/k8s/wait-ready.sh
bash scripts/k8s/smoke.sh
```

## Rollback và dọn demo

Nếu muốn quay lại revision Deployment trước, chọn revision **đã có guard chỉ đọc**
và tag immutable còn tồn tại. Không rollback về binary cũ chưa chặn startup writes:

```bash
kubectl --context docker-desktop -n avengers-coffee rollout history deployment/api-gateway
kubectl --context docker-desktop -n avengers-coffee rollout undo deployment/api-gateway
kubectl --context docker-desktop -n avengers-coffee rollout status deployment/api-gateway --timeout=180s
```

Rolling restart chỉ đổi Pod template timestamp; không thay đổi binary/version.
Để demo một thay đổi image thật, build với tag version khác và `kubectl set image`
sau khi test. Trước rollout thật hãy giữ image ID/tag cũ; không dựa vào tag local
đã overwrite để rollback code.

Dừng demo và quay về Compose nếu bạn muốn tiếp tục workflow ứng dụng bình thường:

```bash
bash scripts/k8s/teardown.sh
docker compose up -d --no-deps identity-service menu-service inventory-service order-service news-service ai-service api-gateway web-customer
```

Compose mode bình thường vẫn có startup seed/worker theo code cũ khi không bật
flag; việc khôi phục mode này có thể ghi database. Không chạy rollback Compose
trong qualification chỉ đọc và chưa thực hiện teardown ở phiên kiểm chứng này.

Namespace phải được xóa xong để giải phóng port và tránh hai bản Order/AI cùng
chạy. Infra đang được giữ nguyên. Không dùng `docker compose down -v`, `docker
system prune`, `git reset`, `git clean` hoặc xóa cluster để rollback demo này.
Teardown không xóa Metrics Server. Không commit/push trong quá trình triển khai này.
