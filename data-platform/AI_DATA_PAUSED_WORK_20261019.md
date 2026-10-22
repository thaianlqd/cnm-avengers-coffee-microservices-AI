# Việc cũ tạm dừng — bàn giao ngày 19/10/2026

Theo yêu cầu mới nhất của người dùng: **dừng việc CI/release đang làm; ưu tiên lập PLAN cho chất lượng phân tích AI và ba mức phân tích**. Không tiếp tục sửa sản phẩm, commit hoặc push trong lượt lập PLAN. Người dùng tự đẩy Git.

## Revision và bằng chứng đã có

- HEAD lúc tạm dừng: `e7da8e18a95e9130d819624e2f86c6a36fc60ae7`, branch `branch_thaian`; working tree sạch trước khi tạo tài liệu mới.
- Source đã kiểm: `0e6fa9f96173ec9850f442cb5b3b831dabe3f073`. [CI source 39273979348](https://github.com/thaianlqd/cnm-avengers-coffee-microservices-AI/actions/runs/39273979348) đã xác minh **6/6 job success**. Delivery commit `e7da8e18` chỉ bổ sung tài liệu/bằng chứng; 539 file source giữ nguyên so với source commit.
- [CI delivery 39277188130](https://github.com/thaianlqd/cnm-avengers-coffee-microservices-AI/actions/runs/39277188130): quan sát cuối trước khi tạm dừng là **4/6 success**, backend semantic và two-process/load/fault/soak còn chạy. **Chưa xác minh kết quả cuối**, không suy ra đã xanh hoặc đã lỗi. API lấy chi tiết jobs có lúc trả HTTP 502; đây chưa phải bằng chứng test fail. Không tự cancel/rerun CI.
- Hồ sơ hiện có: `AI_V35_ACCEPTANCE_REPORT_20261019.md`, `AI_V35_FINAL_HARDENING_PLAN.progress.md`, `evaluation/v35/release-20261019/`. Các tuyên bố nghiệm thu phải đọc theo revision và phạm vi ghi trong từng receipt.
- Trước khi dừng, các kiểm tra local đã qua gồm backend 1301, semantic 146, web 183, UI 35, actual HTTP 4, pipeline integration 41, hai API process, load/fault và soak 900 giây. Đây là kết quả lịch sử của đợt hardening; không chạy lại trong lượt PLAN.

## Việc phải làm khi tiếp tục phần cũ

1. Đọc lại HEAD/working tree, đối chiếu changes của người dùng; xác minh CI delivery đúng SHA và đủ sáu job. Nếu có lỗi, lấy log đúng job rồi sửa đúng phạm vi, không sửa các microservice khác để làm đẹp kết quả Data Platform.
2. Đối chiếu manifest/artifact và runtime source identity; snapshot runtime, source health, completeness và SLA phải lấy lại theo thời điểm nghiệm thu. `healthy` không đồng nghĩa `complete`.
3. Repo API CI từng có Order 401/503 và Menu thiếu `orders.chi_tiet_don_hang`; phân loại riêng, chưa chứng minh cùng nguyên nhân với AI Data Analyst. Không tự mở rộng phạm vi.
4. Branch protection chưa bật tại quan sát trước; chỉ là giới hạn governance đã ghi, không tự thay settings.
5. Giữ giới hạn CPU/RAM quiet hiện tại, không khởi động Spark/Airflow hoặc full suite đồng thời. Không dừng dịch vụ người dùng đang dùng để giảm CPU mà không đánh giá phụ thuộc.

## Blocker AI mới — không được coi là đã FINAL

Người dùng cung cấp cùng câu hỏi tỷ lệ hủy đơn tháng 09/2026 tại Hồ Chí Minh: mức sâu trả KPI 4,7% nhưng **0 chart**; mức toàn diện có **3 chart**, trong đó cột một thành phố và cơ cấu doanh thu không đủ trả lời bài toán hủy. Nghiệm thu 16 dashboard preset trước đây **không chứng minh mọi câu hỏi tự do và mọi mức phân tích** đã đạt. Đây là khoảng trống chất lượng cần PLAN/triển khai mới, không được đóng bằng việc CI cũ xanh.

## Các việc chưa ưu tiên trong lượt này

- Word/export không phải ưu tiên mới của người dùng; giữ chức năng tương thích, chưa dành lượt tối ưu tài liệu Word.
- Không làm lại login, kiến trúc, ingestion hay quyền ADMIN đã ổn chỉ vì tham khảo UI sản phẩm khác.
- Lỗi dữ liệu/503 từng xử lý bằng MVCC replica cần theo dõi nếu tái xuất hiện; không khẳng định đã sửa toàn bộ mọi nguyên nhân 503 và không quay về TRUNCATE để chữa nhanh.

## Ranh giới vẫn giữ

Provider/API key chỉ dùng trong workflow Trợ lý AI được phép. Không gọi provider thật khi lập PLAN, không tăng trần/đổi ledger; checkpoint ledger đã ghi là 457 reservations/events, hash `b3c07acb5db22752fd0f69937e42fa49f64ac9cba448332ff8e22dcb490db40d` (không phải quyền chi tiêu mới). Không reset offset, Redis, volume; Supabase chỉ đọc; không thay schema/quyền DB thật ngoài gói được duyệt. Giữ auth, scope, semantic formula, readonly SQL, jobs/idempotency/cancel/revoke và mọi guard đã chạy ổn.
