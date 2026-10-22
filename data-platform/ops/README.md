# Quan sát Data Platform V3.5

`GET /metrics` xuất Prometheus text; `GET /api/system/metrics` giữ JSON tương thích. Cả hai cần `system.read`; không có anonymous bypass. Collector là tùy chọn, chưa tự bật. Cấu hình `prometheus.yml` dùng credential ADMIN được cấp qua file private bên ngoài repo, không đưa token vào URL hoặc log. Không mount credential Kafka/replica vào collector.

Counter/histogram thuộc từng process. Cộng `rate(analytics_events_total[5m])` giữa các target; xử lý reset theo từng series trước khi cộng. `analytics_stage_duration_seconds` dùng giây. Không cộng count và bucket thành số lần thực thi.

`analytics_source_states` và `analytics_source_observations_known` là projection của nguồn dùng chung. Chọn một target có trách nhiệm xuất DataHealth khi đọc các gauge này; không cộng hai API. Chỉ dùng `max` khi đã đối chiếu cùng generation. Presence=0 nghĩa là chưa có quan sát, không phải toàn bộ nguồn khỏe. Exporter không truy vấn DB/provider khi scrape và không tự refresh snapshot hết hạn.

Labels chỉ stage/status/state đã định nghĩa. Không có SQL, prompt, token, account, request ID, job ID, store hoặc giá trị dòng trong labels. W3C traceparent và ContextVar giữ ở trace/log có kiểm soát; OTel API không tự tạo distributed trace backend.

Fixture hai API: `.claude/scripts/dp-v35-two-api.sh start`, sau đó chạy `pipeline-tests/v35_two_api.py` trong namespace `avengers-v34-fixture-postgres-1` với `V35_TWO_API_FIXTURE=1`. Harness chỉ dùng Redis loopback DB15, SQL adapter SQLite và chặn outbound HTTP/PostgreSQL. Không dùng credential thật, không bật MinIO/Kafka. Ca crash là reservation được tiêm trước transport; không có paid send.

`v35_operational_soak.py` chạy 900 giây, nhịp 5 giây, đối chiếu tổng request counter của hai target với số HTTP thực tế, kiểm tra job/ownership context và percentile. Không chỉnh code/topology hoặc gửi traffic ngoài workload vào fixture trong cửa sổ đo. Kết quả chỉ chứng minh tải cục bộ đã đo; freshness worker thật, crash recovery và streaming cần bằng chứng riêng. Không gọi đây là SLO production.


## Giữ máy phát triển nhẹ

Bản local giới hạn API0,50CPU/1024MiB, MinIO0,20CPU/768MiB (Go heap384MiB/GOMAXPROCS1), producer0,10CPU/256MiB, consumer0,15CPU/384MiB và replica0,20CPU/384MiB. Producer chờ60s giữa các cửa sổ đã hoàn tất; nguồn chi tiết đơn không có update clock chỉ quét đầy đủ theo contract3600s. Không đổi eventID, cursor, topic/group hoặc offset khi giảm tải.

Backlog Kafka phải được công bố là đang xử lý, không báo khỏe chỉ vì process đang chạy. Giữ nguyên offsets và Bronze. Không tự bật Spark/Airflow/collector để xem dashboard: dashboard đọc PostgreSQL replica và không phụ thuộc MinIO. Dừng các API fixture sau khi lấy proof để giải phóng RAM.

Chỉ tab **Trợ lý AI** có luồng được phép gọi provider. Preset dashboard có lớp chặn logical/physical reservation ngay trong ProviderBudget và job ledger. Xem/lọc/inspect/lưu/xuất báo cáo không sử dụng API key. Tác vụ AI không tự resume ở BI/Quản lý Báo cáo; rời tab Trợ lý AI gửi cancel owned job. Request đã được gửi tới provider trước khi hủy không thể thu hồi.

`v35_load_profiles.py` kiểm admission1/4/8/12/20,3lần/profile và headroom cho owner thứ hai, dùng cùng hai API/RedisDB15. Đây là fixture SQLite, không đủ để chứng nhận PostgreSQLpool/providertransport hoặc toàn bộ G12.


Browser HTTP fixture giữ network-none: chạy `V35_BROWSER_FIXTURE_RELAY=1 python3 data-platform/pipeline-tests/v35_browser_relay.py` trên host, rồi đặt `V33_API_TARGET=http://127.0.0.1:18766` khi chạy project`api` của Playwright. Relay chỉ bind127.0.0.1 và chuyển API request vào container v35-fixture-api-a bằng dockerexec; không cấp egress cho API fixture. Fixture allowlist đúng Originhttp://127.0.0.1:4173 của Vite, không tắt Origin/CSRF checks. Dừng relay và cả hai API fixture sau test.

API dùng2jobworkers,6SQLreaderconnections và2snapshotcoordinators mỗi process (mỗi report≤2queryworkers). HaiAPI có tối đa12pooledreaders; đây không bao gồm metadata/readiness/audit/writer/direct connections. Admission vẫn12global/4owner. Test áp lực PostgreSQL phải chứng minh kết nối thứ7/API bị từ chối và mọi kết nối được trả về.

Replica full snapshot dùng tempstage trong session, DELETE khóa không còn và upsert chỉ dòng thay đổi; proof/certificate/checkpoint commit cùng transaction. BI tiếp tục đọc generation cũ trong lúc fetch/validate, tránh ACCESS EXCLUSIVE của TRUNCATE. User đã duyệt DELETE trên đúng23targettables; nguồn Supabase vẫn READONLY. Không chạy grant/migration lại trong tác vụ thường ngày.

CI job `DP V35 / two processes / load / faults / 15min soak` chạy ownership/CAS,15loadprofiles,soak900s và5crashwindows/cancel/revocation/circuit/pool/Redisoutage. Mọi transport nằm trong networknone namespace với loopback; có meter fake, không key/provider thật. Lỗi được giữ trong artifact và chỉ upload sau secret scan. CI đúng candidatecommit và required branch rules vẫn cần user/repoadmin hoàn tất.
