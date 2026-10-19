# Data Platform V3.5 — nghiệm thu release candidate

**FINAL_VERIFIED / RELEASE_READY** cho nguồn tại commit `0e6fa9f96173ec9850f442cb5b3b831dabe3f073`. Sáu job Data Platform đã SUCCESS trên cùng SHA trong [CI run 39273979348](https://github.com/thaianlqd/cnm-avengers-coffee-microservices-AI/actions/runs/39273979348). Local validation giữ trạng thái LOCAL_VERIFIED; remote-ci.json ghi REMOTE_CI_VERIFIED; release-gates.json ghi FINAL_ACCEPTED. Required branch checks chưa được enforce là giới hạn governance repo, không phải blocker RC theo yêu cầu user.

Commit bàn giao chỉ bổ sung tài liệu/chứng cứ phải giữ nguyên fingerprint nguồn `7a7d975b5f920ef56384bfc510904701df65b64dcd1c9eae666ab450a60f658c` và cũng qua sáu job CI. SHA bàn giao chính xác được ghi bởi artifact `dp-candidate-identity` của run tương ứng với `git HEAD`; không đưa một SHA tự tham chiếu giả vào chính commit chứa báo cáo.

## Bản sửa và bằng chứng

- Test catalog-under-lock thuộc Analytics API đã chuyển sang `acceptance_snapshot_reader.py`, chạy bằng image/API suite có đúng dependency. Image pipeline không import `services`; regression được giữ nguyên và có kiểm tra AST bảo vệ ownership.
- Worker từ chối cấu hình thiếu/sai hoặc production chạy legacy **trước I/O**. Dockerfile và Compose khai báo production/governed. Legacy chỉ dùng khi development/test chọn rõ. Worker mới đã triển khai, vẫn 0,20 CPU / 384 MiB; không thay thuật toán MVCC, CAS, parity hoặc transaction publication.
- Fresh replica provisioning đã khớp MVCC: SELECT/INSERT/UPDATE/DELETE đúng 23 target, không cấp TRUNCATE. Đây là sửa công cụ triển khai/fixture; không chạy lại công cụ lên production, không đổi quyền nguồn hoặc tự thu hồi quyền đã duyệt. Acceptance kiểm DELETE23/23, TRUNCATE0/23 và vẫn từ chối ghi stream/tạo schema.
- Fixture dùng compiled runtime contracts giống worker, có finite enums và physical clock types. Kiểm chứng thực từng proof theo generation/schema/contract; snapshot parity không tự đóng kỳ nghiệp vụ.
- Regression kiểm trạng thái từng dependency của 16 dashboard: blocked/unknown/degraded và nguồn thiếu truyền đúng tới dashboard liên quan, không gọi provider.
- CI xuất artifact `dp-candidate-identity`: commit SHA, run/attempt và SHA256 từng file từ clean checkout. Artifact chỉ upload sau scan và positive control xanh.

Evidence mới tại [release-20261019](evaluation/v35/release-20261019/). Bộ `implementation-20261019` là bằng chứng lịch sử có timestamp riêng, không được đổi nhãn thành test của candidate mới.

## Các gate hiện tại

| Gate | Kết quả mới |
|---|---|
| Full backend offline/network none | 1.301/1.301 PASS; 741,240 s; 1 CPU / 1 GiB |
| Semantic | 146 ca; compile108/108; V33 33/33; V34 120/120; authored reference120/120, 83 intents |
| Pipeline | 65/65 unit; 41/41 actual PostgreSQL/MinIO/Kafka/batch; 33/33 API PostgreSQL/Redis acceptance |
| Worker compatibility | 6/6 PASS; explicit development/test legacy |
| Web | 183/183; typecheck/build PASS |
| Browser | 35/35 UI và responsive; 4/4 HTTP thật; SQL fixture có hoạt động, external HTTP0 |
| Two processes | Ownership/idempotency/CAS/crash reservation PASS; 15 load profiles PASS,111 completed/24 expected429;900ssoak1922/1922operations,60/60jobcontext;5crashwindows/cancel/revoke/circuit/pool/Redis PASS |
| Secret scan | Frozen inventory963files/~106,8MB,0finding; positive control42; receipt/manifest cuối được quét delta trước commit; CI quét lại toàn bộ commit |
| Metadata/architecture | Regeneration --check, git diff --check PASS;81 modules/409edges, không tăng coupling |
| Remote release | **6/6 SUCCESS** trên `0e6fa9f96173ec9850f442cb5b3b831dabe3f073`; [run 39273979348](https://github.com/thaianlqd/cnm-avengers-coffee-microservices-AI/actions/runs/39273979348) |

Xem [local-validation.json](evaluation/v35/release-20261019/local-validation.json), [source-manifest.json](evaluation/v35/release-20261019/source-manifest.json) và CI artifact. Fingerprint nguồn loại tài liệu/receipts để tránh tự tham chiếu; manifest CI vẫn bao phủ cả source và evidence đã commit. Receipt remote được tạo sau khi CI hoàn tất và ghi SHA thực tế; tài liệu không giả định trước SHA tự chứa chính nó.

## Dữ liệu thật và giới hạn

Snapshot runtime tại thời điểm đo ghi **23 healthy / 0 blocked / 0 degraded**; completeness **12 complete / 11 unknown / 0 partial** tại14:57UTC (quan sát trước có1partial). Healthy phản ánh load/schema/quality trong SLA, không có nghĩa toàn bộ lịch sử đã đóng. `orders.don_hang` đang có snapshot parity đầy đủ ở generation vừa reconcile; điều này không chứng nhận mọi kỳ nghiệp vụ. Chỉ kỳ09/2026 của đơn và chi tiết có attestation của admin. Các kỳ khác không được lấp số0 hoặc coi là certified. Proof/generation và danh sách unknown nằm trong [runtime-after.json](evaluation/v35/release-20261019/runtime-after.json).

Tình trạng payment blocked ở quan sát cũ không tái hiện trong snapshot mới. DA_DUYET giữ mã lịch sử hợp lệ theo xác nhận nghiệp vụ. Không thay enum/clock/định nghĩa KPI để ép nguồn thành healthy. D15 vẫn có verification partially_verified nếu dữ liệu cần đối soát; khảo sát thiếu chi nhánh giữ nhóm chưa phân loại.

ADMIN-only; policy3.5.0-local-admin-governed;65protected routes,0undeclared/0stale; reader6/query concurrency2. Ledger **457/events457**, SHA256 `b3c07acb5db22752fd0f69937e42fa49f64ac9cba448332ff8e22dcb490db40d` không đổi. Chỉ workflow Trợ lý AI được dùng provider. Các gate offline không gọi paid provider; logical scripted fixture calls không phải HTTP thật.

UI đang phục vụ bundle `index-BaIpSnt1.js`, SHA256 `0d2b79cad711bd6f4a296ab83f846c5ae9992c33267da73e353efc61512830bc`. Giữ login nền café/form phải,16dashboard,shared BI/AI ReportWorkspace,chart214px/lưới8/4 hoặc6/6/mobile1cột,giải thích/kết luận đóng mặc định và tab kiến trúc. Không làm lại UI theo sở thích;35browserjourneys kiểm các hành vi này.

Các phép đo load/soak là fixture hai process, không chứng minh production HA hoặc production SLO. Kafka có backlog đang xử lý; không gọi Silver realtime hay exactly-once. Không reset offsets/Redis/ledger/volume, không bật Spark/Airflow/collector. Không thay Chatbot/Order/Menu/K8S.

Repository **chưa enforce required branch checks** (`applicable_branch_rules=[]`, protected=false). Đây là giới hạn governance của repo, không phải lỗi source và không chặn release candidate nếu sáu gate thực tế xanh. Không tự đổi branch settings. API CI toàn repo ở baseline có lỗi Order e2e401/503 và Menu thiếu relation `orders.chi_tiet_don_hang`; không gọi toàn repo xanh và không refactor nghiệp vụ ngoài scope. Word visual QA hoãn theo yêu cầu user.

## Kiểm tra nhanh

Mở8501: Tổng quan có số liệu; Báo cáo chọnD01/D03 và đổi kỳ/phạm vi, bấm mở/đóng lời giải thích; ADMIN vào Explorer/System; Kiến trúc xem luồng replica/stream/batch. Các thao tác này không dùng provider. Nếu cần rollback worker, giữ committed snapshot/checkpoint/offset; không chạy TRUNCATE/repair/reset.

Snapshot bổ sung trước nghiệm thu: 2026-10-19T15:17:22.622195+00:00; status={"healthy": 23}; completeness={"unknown": 11, "complete": 11, "partial": 1}; SQL mode=trusted_admin. Xem [runtime-release.json](evaluation/v35/release-20261019/runtime-release.json). Các quan sát có generation/timestamp riêng, không suy ra completeness cố định.
