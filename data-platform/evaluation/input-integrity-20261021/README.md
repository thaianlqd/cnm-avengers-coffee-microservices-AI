# Nghiệm thu input integrity — 21/10/2026

Đã triển khai policy **1.2.1** cho câu hỏi, các trường ngữ cảnh/kỳ vọng/legacy context, direct propose/job, điều chỉnh và refresh workspace. Bản chạy: [Data Platform](http://localhost:8501). Kế hoạch và lịch sử triển khai ở [C.10](../../AI_DATA_ANALYST_BUSINESS_COVERAGE_PLAN_20261020.md#c10-checkpoint-triển-khai--21102026).

Không biến tên/điều kiện chưa xác minh thành không có phạm vi. Pending, mất kết nối và preflight cũ không cho gửi phân tích; input vẫn sửa được. Không gọi AI hoặc analytical SQL khi kiểm tra lúc gõ. Tra cứu tên là thao tác chủ động, có quyền, giới hạn và cache riêng.

## Bằng chứng cuối

| Lớp | Kết quả | Receipt |
|---|---|---|
| Backend hồi quy cuối | **158/158 PASS**, snapshot bất biến, network none, 2 CPU/2 GiB, memory stores | [Log](accepted-regressions.log), [SHA từng file](accepted-source-manifest.json) |
| Input oracle | **22/22 baseline + 240/240 corpus + 60/60 regression**; HTTP/provider = 0, kết nối PostgreSQL = 0 | [Offline receipt](offline-acceptance-v121.json) |
| API thật 8501 | **22/22**; ba trường phụ cùng chặn tỉnh sai; propose trả needs_clarification/provider 0, job trả HTTP 400 | [Runtime receipt](runtime-acceptance-v121.json) |
| Lookup dữ liệu thật | Tên cửa hàng exact BOUND: **1 metadata query**; preflight lặp **0 query / 0 AI** | [Runtime receipt](runtime-acceptance-v121.json) |
| Browser fixture | **15/15 PASS**: pending/stale/error, IME, sửa câu, một submit, giữ draft/report khi refinement lỗi | [Log](browser-final-2.log) |
| Web logic | **222/222 PASS**, typecheck/build đã qua; bundle thực phục vụ đối chiếu SHA | [Log](web-unit-final-2.log), [Bundle](runtime-acceptance-v121.json) |
| Metadata/entrypoints/revision checkpoint | **85/85 PASS** trước bước thêm trường phụ; không thay cho source cuối | [Log](acceptance-final-targeted.log) |

Bộ 60 ca chỉ là holdout ở lần đo đầu **59/60**; [receipt đầu tiên](holdout-first-pass.json) được giữ. Sau sửa, gọi là regression set. Bảy ca ngưỡng tổng hợp trong corpus và HV15 được đổi expected theo giới hạn contract HAVING; giữ nguyên câu/ID/denominator và các file oracle v1. Không dùng điểm này làm điểm hiểu AI hoặc chính xác số liệu.

Inventory duyệt 56 categorical dimensions và 282 câu B01–B34/X. Hai câu vẫn cần làm rõ, không bị bỏ nghĩa: BC-B08-004 (qualifier voucher vòng quay chưa đủ binding/source), BC-B33-003 (horizon “tháng sau” chưa có alias contract). Tài khoản không national dùng mã cửa hàng được cấp; chưa tra cứu tên toàn kho. Tên địa điểm chưa rõ loại/không có bằng chứng exact tiếp tục yêu cầu chọn lại, không đoán.

## Full runner và giới hạn nghiệm thu

[Full scan policy 1.2.0](full-backend-frozen-v12.log) đã chạy hết **1.619 tests**, kết quả **11 failures / 15 errors**. Đây là lượt tìm lỗi, **không phải full PASS source cuối**. Các lỗi mới thuộc intake đã được sửa và đưa vào bộ 158 tests cuối. Năm lỗi đọc JSON xuất phát từ snapshot full scan thiếu fixture evaluation; bộ cuối đã mount đủ bốn JSON capture, không bỏ các ca này.

Các adapter trong tests/archive_planner.py và tests/gate_fixtures.py chỉ dành cho fixture transport/algebra hoặc provider outcomes bắt đầu sau intake; pinned-cohort depth fixture cũng dùng adapter này vì tên rich-fixture không nằm trong intake metadata. Không có env flag, request field hoặc route để tắt guard production; các test HTTP/job kiểm trực tiếp production gate và cấm provider/SQL.

Còn chênh lệch ngoài intake trong full scan: test danh mục đếm 35 trong khi registry đã có 53 dashboard, fingerprint capability fixture cũ, D50/D53 không có dòng trong warehouse fixture. [Đối chứng cô lập](existing-fixture-isolation.log) thay intake bằng stub **chỉ trong test process offline** để phân loại các lỗi này; không sửa product, không nới assertion. Không khẳng định toàn bộ IG1–IG8 đạt hoặc mọi test repository đều xanh.

SLO warm preflight wall p95 50ms từng trượt ở API Docker 0,5 CPU/1 GiB; đối chứng tắt riêng guard cũng trượt. Full scan tách 2 CPU không đại diện allocation API. Không nới timeout/ngưỡng hay tăng tài nguyên để gọi IG6 PASS. Chưa đo đủ typing p95 trên report lớn, chưa chạy thêm provider thật hoặc chứng minh numeric/source completeness trong lượt này.

## Thử lại

1. Mở Trợ lý AI trên 8501, nhập `phân tích doanh thu tỉnh abcjdsakjd`: chip tỉnh chưa xác minh, cả Phân tích/Xem kế hoạch bị khóa; Enter không tạo job.
2. Dùng nút sửa sang Hà Nội hoặc nhập `doanh thu Hà Nội tháng 9 năm 2026`: scope phải đúng câu hiện tại rồi mới mở nút.
3. Thử `doanh thu Hà Nội và tỉnh Qzxn`, `doanh thu miền Nam trừ tỉnh Qzxn`, `top -5 chi nhánh theo doanh thu`, `doanh thu tháng 13 năm 2026`, `số đơn trạng thái Qzxn`: giữ nội dung, hỏi đúng phần chưa hợp lệ, không chạy AI.
4. Với tên cửa hàng hợp lệ chưa có cache, dùng thao tác kiểm tra tên trong dữ liệu. Không dùng tên gần giống làm filter nếu chưa chọn.
5. Trong report đã có, thử điều chỉnh tỉnh Qzxn: giữ draft và report/revision cũ, khóa Áp dụng; sửa đúng và đợi kiểm tra hiện tại.

Lệnh tái hiện backend theo `.claude/rules/data-platform.md`, luôn `AI_OFFLINE=1`, bỏ env provider policy của container, memory session/artifact stores. Full runner: `python -m tools.run_tests_v29`. Corpus receipt: `python -m tools.input_integrity_audit`.

Không có mật khẩu/token/provider key trong evidence. Không đổi schema/grant/dữ liệu nguồn, allocation, Spark/Kafka/Airflow/MinIO hoặc K8S; không reset/restore/clean/stash/commit/push.
