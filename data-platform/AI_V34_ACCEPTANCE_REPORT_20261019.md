# V3.4 — Báo cáo nghiệm thu tổng quan (19/10/2026)

> Kết luận ngắn: **Các gate kỹ thuật chạy được trong môi trường này đã đạt trên candidate cuối** — live run6 (39/40, 0 hard failure),
> backend 1254, e2e 32, batch publication thật 3 layer, gitleaks sạch. **Chưa tuyên bố FINAL/COMPLETE** vì còn các mục mà môi trường này
> không làm được hoặc repo cấm: Word render QA (không có renderer), remote CI/branch policy (cần push), SLA 15 phút / SLO 7 ngày /
> 2-process load, completeness replica (`unknown`). Chưa commit.

## 1. Thu được gì sau PLAN

| Hạng mục | Kết quả |
|---|---|
| Backend analytics-api | **1254 test OK** trên candidate cuối (trước: 1239 có 1 failure + 1 error) |
| Eval offline | 146 ca đạt (113/113 retrieval, 108/108 compile, 33 ca V3.3, 120 ca V3.4) |
| Reference tác giả | 120/120, hash `8b6f9164…aaefa` (đo năng lực compile, không phải độ chính xác LLM) |
| Web-ui | 180 test, typecheck, build đạt; bundle phục vụ `index-BrCyyeAb.js` khớp source |
| Pipeline unit (fixture) | 41 test đạt |
| Replica 23 nguồn | Đã bật thật, mỗi vòng 23/23 thành công, 0 restart |
| Kafka | Đã bật; producer có xử lý lock; consumer 0 restart |
| Live full44 | run4 34/40 FAIL; run5 39/40 nhưng hard failure L30 (FAIL); **run6 39/40, 0 hard failure, `release_passed: true`** |
| L30 sau sửa | Chẩn đoán live riêng SUCCESS (1 lượt); run6 đạt trong full44 |
| Batch publication thật | **Đã chạy** Bronze→Silver→Gold bằng role riêng; 3 layer cùng run_id, hash object kiểm đạt, quality `passed`, completeness `unknown` |
| Browser e2e | 32 passed (52,6s) trên fixture HTTP đã restart với source mới |
| Secret scan | Gitleaks v8.30.1 trên 882 file stage: no leaks |
| Ledger | 457/480 (xem mục 4) |

## 2. Thay đổi đã làm trong phiên này (theo lỗi)

1. **Test grammar thời gian** (`tests/test_semantic_recovery_boundaries.py`): nhánh `null` chỉ hợp lệ ở repair (xoá field);
   vẫn kiểm đủ 7 kind và required fields. Không xoá test, không hạ guard.
2. **Preflight chậm** (`test_preflight_stays_zero_call_and_fast`): chạy riêng thì đạt; chỉ chậm khi full-run cùng Kafka/sync/fixture.
   Giữ ngưỡng 50ms, ghi là *giới hạn đo*, không đánh dấu flaky để bỏ qua.
3. **F07 platform** (`routers/platform.py`): bỏ toàn bộ số mẫu (dung lượng, lag, jobs, SLA, DAG giả, số dòng…). Trả `null` /
   `not_measured` / `configured`; DAG id thật `avengers_daily_pipeline`; chỉ dùng `analytics.pipeline_publications` làm
   con trỏ publication; lỗi DB không còn lộ nội dung exception qua HTTP. Thêm 4 test hồi quy (`test_v34_platform_routes.py`).
4. **Producer lock** (`kafka-producer/producer.py`): replica `TRUNCATE+INSERT` giữ lock → `LockNotAvailable` làm worker thoát.
   Nay retry tối đa 5 lần với backoff (chỉ SQLSTATE `55P03`); lỗi khác vẫn dừng; cursor/offset không bị reset. Có test.
5. **Semantic sau live run4** (có fixture từ raw output run4/run5, evidence cũ không bị sửa):
   - L30: loại requirement trùng chỉ khác sibling metric chưa được nêu (`store_revenue` vs `revenue`), kể cả khi model thêm
     `domain_id`/features mà observer không ghi.
   - L41: so sánh kỳ chỉ cần feature `scalar`; `change`/`change_pct` do compiler sở hữu.
   - L06: bỏ `selected_total` không được hỏi trên requirement có chiều nhưng không phải ranking.
   - L21/L43: model tuyên bố `unsupported` trần (không requirement) hoặc viện dữ liệu lịch sử (thuộc server) trong khi metric đã khoá →
     hỏi lại **một** lần; lần hai vẫn từ chối thì giữ nguyên kết quả unsupported.
   - Test: `tests/test_v34_live44_fourth_regressions.py` (11 test) + `tests/fixtures/v34_live44_rerun4_failed_intents.json`.
6. **Docker nhẹ hơn**: dừng 4 container fixture; giới hạn CPU/RAM cho MinIO/Kafka/consumer/MQ/analytics-db bằng `docker update`
   (không mất dữ liệu, mất khi container bị tạo lại).

## 3. Kết quả live (frozen cohort 44 bắt buộc / 40 useful, hash `5fc5eb47…da2c`)

| Run | Useful | Hard failure | Ghi chú |
|---|---|---|---|
| run3 | 33/40 | L03 | trước phiên này |
| run4 (trần 380) | 34/40 | L30 | fail L06, L21, L29, L30, L41, L43 |
| run5 (trần 440) | **39/40** | **L30** | chỉ fail L30; L06/L21/L29/L41/L43 đạt lần này |
| L30 diagnostic | SUCCESS | không | 1 ca, không phải release |
| run6 (trần 480) | **39/40** | **không** | `release_passed: true`; chỉ L21 (useful_no_guarantee) trượt; p95 3157ms; durable counters khớp |

Gate: ≥38/40, L03 đúng, không hard failure. Run5 đạt điểm nhưng không đạt gate vì L30; **run6 đạt gate** (đây là lần chạy trên candidate cuối, chưa ghép run nào).
Cảnh báo trung thực: kết quả giữa các run dao động (model không tất định). L29 chưa có sửa tất định (model tự đoán danh sách
thành phố cho "miền Bắc/Nam"); nó đạt ở run5 nhưng có thể fail lại. Không ghép kết quả của nhiều run hay chạy một ca để thay gate.
Evidence: `analytics-api/evaluation/v34/live44-20261019-r{4,5,6}/` và `live44-20261019-r5-l30-diagnostic/`.

## 4. Quota và phê duyệt

- Ledger: 320 → run4 366 → run5 412 → diagnostic L30 413 → run6 +44 = **457/480** (còn 23, không đủ cho full44 nữa).
- Phê duyệt đã dùng: trần 380 (run4), 440 (run5), 480 (run6, đúng đề xuất bạn duyệt). Không dùng ngoài phạm vi.
- Cảnh báo: run6 đạt nhưng model không tất định; L21 vẫn có thể trượt, L29 chưa có sửa tất định. Không chạy lại để "chọn lần đẹp".

## 5. Việc chưa xong (theo PLAN Phase)

| Việc | Lý do / cần gì |
|---|---|
| Full44 trên candidate cuối (Phase 8) | **Xong (run6 đạt gate)**. Candidate sau đó chỉ thêm tool/test batch + compose, không đổi code semantic |
| Batch publication thật Bronze→Silver→Gold (Phase 3) | **Xong** (mục 7). Lưu ý: không có DAG Airflow chạy thật, chưa đo SLA lịch |
| Browser e2e | **Xong** 32 passed. Chưa bổ sung ca browser riêng cho SystemAdmin/F07 mới; view Streaming/Pipelines/Storage/Architecture chưa mount trong nav |
| Word render QA | Môi trường không có renderer; không coi kiểm ZIP/OOXML là QA hiển thị |
| Scan source cuối | **Xong** (gitleaks sạch). Chưa cập nhật AST/manifest handoff 210 file cho candidate mới |
| Remote CI / branch policy | Repo cấm commit/push; cần người dùng |
| Đo SLA 15 phút end-to-end, 7 ngày SLO, 2 API process | Chưa có bằng chứng; không claim |
| F07 `OverviewView` null→0 fallback | Cần rà lại (đã có error gate, đừng bỏ) |

## 6. Giới hạn đo và rủi ro cần biết

- Kafka: producer từng restart 4 lần trước bản sửa lock; cần theo dõi thêm để xác nhận bản mới không còn restart. Backlog
  đang xả nên CPU Docker cao (producer 500 dòng/lần, consumer ghi MinIO). Muốn nhẹ ngay: `docker stop avengers_kafka_producer`
  (giữ cursor), bật lại bằng `docker start`.
- Replica: completeness và late-commit **chưa được chứng nhận** (giữ `unknown`).
- Replica cadence thực tế là chờ 300s *sau* mỗi vòng (≈330s start→start), không phải wall-clock 300s chặt.
- Backend 1254 OK đã chạy sau thay đổi cuối; eval offline (146 ca) chạy trước rule L30 mở rộng, chưa chạy lại.
- Test "preflight nhanh" phụ thuộc tải máy; benchmark 990 principals cũ không thay thế phép đo mới.

## 7. Batch role và publication thật (ĐÃ ÁP)

- `analytics-api/tools/deploy_v34_batch.py`: plan review `analytics-api/evaluation/v34/batch-rollout-20261019-plan.json`, kết quả áp `...-applied.json`.
  Group `avengers_batch_runner` + login `avengers_dp_batch` (profile `0600`, mount read-only chỉ vào spark-jobs). Grants: `USAGE` schema orders/analytics;
  `SELECT` 5 bảng nguồn Bronze + `ingestion_checkpoints`; `SELECT,INSERT` `pipeline_runs`, `gold_dataset_versions`; `SELECT,INSERT,UPDATE` `pipeline_publications`.
  Không DDL/TRUNCATE/DML silver-gold; không mượn role owner/Kafka/replica.
- Bronze không còn extract `dia_chi_giao_hang`, `ghi_chu`, `delivery_address`; `DATA_PLATFORM_GOVERNED_BATCH=1` dùng profile riêng, không fallback credential rộng (compose mặc định 0).
- Đã chạy thật 2 lần (entrypoint của image tự chạy pipeline nên lệnh xác minh đầu vô tình chạy thêm một run — cả hai commit thành công,
  con trỏ `daily_medallion` chuyển sang run mới hơn `run_a8496f9e…`, đúng quy tắc requested_as_of; run cũ vẫn là object bất biến).
- Xác minh run hiện hành: Bronze 40.460 đơn / 72.063 dòng chi tiết / 7.857 giao hàng / 7.875 tracking / 112 ví; Silver 6 output cùng số dòng;
  Gold 14+ dataset; quality `passed`, `optional_missing=[]`, `source_completeness=unknown`. Mỗi output đọc lại và kiểm hash.
- Giới hạn: số dòng là snapshot tại thời điểm chạy, không phải chứng nhận đầy đủ; Gold/marts/Analyst chưa được đối chiếu cùng generation
  bằng một phép kiểm riêng (chưa làm); Airflow không chạy.

## 8. Đề xuất commit message (người dùng tự commit)

```
fix(data-platform): V3.4 platform honesty, producer lock retry, semantic run4/5 fixes

- platform routes: drop fabricated metrics; not_measured/configured; no raw DB errors over HTTP
- kafka-producer: bounded retry on lock_timeout (55P03), cursor preserved
- semantic: duplicate sibling metric, period comparison scalar, selected_total outside ranking,
  rechecked bare unsupported declaration; fixtures from paid runs (evidence unchanged)
- tests: provider time grammar nullable repair branch, platform honesty, fourth-run regressions
```

## 9. Lệnh đã chạy / tái hiện

```bash
LOG_DIR=/tmp/x .claude/scripts/dp-test.sh backend            # 1254 OK (backend); pipeline unit 43 OK; live run6 release_passed; e2e 32 passed
LOG_DIR=/tmp/x .claude/scripts/dp-test.sh eval               # 146 ca đạt
LOG_DIR=/tmp/x .claude/scripts/dp-test.sh web                # 180 test, typecheck, build
LOG_DIR=/tmp/x bash .claude/scripts/dp-pipeline-test.sh unit # 41 test
```
