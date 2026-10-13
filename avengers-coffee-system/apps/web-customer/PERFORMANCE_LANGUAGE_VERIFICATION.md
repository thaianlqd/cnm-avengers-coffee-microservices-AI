# Kiểm chứng performance và ENG/VIE — 13/10/2026

Đã sửa tải trang customer/admin, nền splash mobile, biểu đồ lịch sử và copy ENG/VIE. Đây là kết quả local của ứng dụng commerce; không phải nghiệm thu kế hoạch AI analytics trong IDE.

## Thay đổi và bằng chứng

- Mobile vào trang chủ sau hydration và intro 200 ms, catalog chạy riêng; lỗi catalog có retry tại trang. Splash dùng cùng màu nền logo `#b22a2e`, title không còn `undefined`. Fixture cố tình chậm catalog 3 giây chứng minh trang chủ hiện trước khi catalog xong; không phải đo cold start native.
- Customer cache GET công khai của catalog/cửa hàng/review stats 60 giây, deduplicate request và giữ qua reload bằng session storage. Cache không chứa token, dữ liệu cá nhân, quote, tồn kho hoặc đơn hàng. Mutation thành công và sự kiện hệ thống invalidation; refresh vượt cache, response cũ không được ghi trở lại sau invalidation.
- Các trang customer được lazy import. File main production giảm từ 1,214,010 byte xuống khoảng 804 KB; số chính xác và gzip tại `artifacts/performance-language/bundle-metrics.json`. Bundle main vẫn còn lớn hơn ngưỡng cảnh báo 500 KB; chưa tuyên bố tối ưu toàn bộ.
- Admin tải tài nguyên theo tab/vai trò, giữ dữ liệu đã tải khi refresh nền; không gọi các query shift history/preflight nếu chưa vào ca làm. Fixture admin khởi đầu 7 GET, manager 6 GET; danh mục chỉ tải khi mở trang danh mục.
- Menu categories dùng một query grouped count thay N query đếm từng danh mục. JSON trước/sau đối chiếu bằng nhau. Ba mẫu GET local, concurrency 2: categories trước `[711.2, 601.6, 605.3]` ms, sau `[312.3, 48.7, 49.9]` ms. Hai mẫu warm giảm khoảng 92%; mẫu nhỏ, không đủ để công bố p95 hay tốc độ toàn hệ thống. Không diễn giải thay đổi ở endpoint khác thành hiệu quả tối ưu categories.
- GET danh sách cửa hàng vẫn khoảng 718 KB, còn khả năng giảm payload/phân trang server; không bỏ trường hiện đang phục vụ checkout để đạt số đo đẹp.
- ENG/VIE xử lý copy UI tĩnh và format thời gian/số; giữ nguyên enum, key thuộc tính, ID và nội dung người dùng/API. Browser QA đi qua 18 nhóm route, chuyển VI/EN trong checkout giữ lựa chọn giao hàng. Tên sản phẩm, đánh giá và nội dung do quản trị viên viết cần nội dung đa ngôn ngữ riêng nếu muốn dịch chúng.
- SSR fixture checkout/nearby đã thích nghi với copy helper và các update tồn kho theo từng nhóm; vẫn kiểm tra đúng oracle khả dụng. Không tự chọn cửa hàng trong khi đang đọc tồn kho. UI sản phẩm/quote dùng fixture, không đặt hàng thật.

## Biểu đồ và phạm vi

Admin tổng đọc tối đa 100 đơn mới nhất bằng `branch_code=ALL`; controller và service chỉ cho ADMIN quyền này. Các vai trò còn lại tiếp tục phạm vi chi nhánh. Cache ALL có namespace mới và bị invalidation khi đơn đổi.

Khi kỳ hiện tại có ít hơn hai ngày quan sát, charts tìm kỳ lịch sử thực kết thúc ở ngày quan sát gần nhất: tối thiểu 7, rồi 30/90/365 ngày khi cần. Banner/subtitle ghi ngày thực tế và phạm vi tập đơn đang đọc; KPI của kỳ chọn không bị đổi thành KPI lịch sử. Manager giữ inventory snapshot hiện tại. Ngày tương lai bị loại khỏi lựa chọn chart. PostgreSQL audit chỉ đọc đếm 40,449 đơn và 0 đơn tương lai, có đơn đến 12/10/2026.

Nếu toàn bộ lịch sử rỗng hoặc query lỗi, giữ khung biểu đồ trung tính kèm trạng thái chính xác; không tạo số liệu giả. Nếu có dữ liệu cũ khi refresh lỗi, hiển thị cảnh báo lần cập nhật trước. Biểu đồ một ngày được ghi là một quan sát. Đây là biểu đồ tập đơn gần nhất, không phải tổng doanh thu warehouse không giới hạn.

## Kiểm tra và triển khai local

- Customer: 24 unit tests cộng hai script SSR checkout/nearby pass; Vite build pass. Fixture browser language, product popup và cache lưu tại `artifacts/performance-language/` và `artifacts/product-ui/`.
- Admin: 14 tests, runtime check, build và fixture admin/manager history/empty pass; xem `../web-admin/artifacts/performance-dashboard/`.
- Menu: 12 tests/build; order: 207 tests/build, gồm isolation phạm vi ALL. Log gốc được lưu trong artifacts. Không dùng account/provider/email thật trong browser QA.
- Full legacy customer lint còn lỗi tồn tại ngoài scoped runtime checks; không coi production build thay cho toàn bộ lint/regression. Chưa đo tải 1/5/10 job hoặc p95 production và chưa deployment production.

Chỉ cập nhật hai container local menu/order bằng build và `up -d --no-deps`; không restart dịch vụ AI/analytics/khác, không đổi schema hoặc index DB.

| Image local | SHA-256 |
| --- | --- |
| Menu đang chạy | `c3b773185286841eeb446a07c903297189a48a57caf61f7a71fc01777921d5a3` |
| Order đang chạy | `5ed890cc06ff6c23c4288d8dfbbc9dea7a34af303a075966620c1ba81d9a744a` |
| `avengers-menu:before-read-performance-20261013` | `e95407c119f4f96a1489c1c096dade4d004ad4cd66d28de53540cb3e2ad44611` |
| `avengers-order:before-dashboard-scope-20261013` | `3c5b2eb079d67cbae0b856cf71b17a3a63ab38c393abfe114f663ce617a24534` |

Hai image rollback được dựng lại từ source trước đúng phần sửa đọc này, giữ thay đổi checkout/tracking hiện có; image cũ ban đầu không còn layer Docker. Đã kiểm tra runner command/build, chưa thực hiện swap rollback sống. Khi quay order về trước, frontend admin cũng phải quay phần đọc ALL/chart tương ứng; giữ diagnostics và dữ liệu hiện tại. Chưa có bằng chứng rollback production.
