# Shipper, banner và bản đồ — 14/10/2026

Đã áp dụng các chỉnh sửa mới trên branch `branch_thaian`, HEAD ban đầu `20f1080e`; không commit/push. Giữ nguyên các thay đổi và artifacts có sẵn của các lượt trước.

## Tài khoản shipper

- Form quản trị có nút hiện/ẩn mật khẩu; chỉ còn Xe máy và Ô tô. Màn phương tiện trong app và API tự cập nhật xe cũng áp dụng cùng giới hạn.
- Dropdown chỉ nhận chi nhánh hệ thống (`CHI_NHANH_CHINH`), loại kiosk nhượng quyền/điểm vệ tinh. Backend kiểm tra lại mã và trạng thái chi nhánh khi tạo/sửa tài khoản.
- API tạo tài khoản trước đây bỏ sót mật khẩu từ form. Đã lưu đúng mật khẩu nhập vào theo contract đăng nhập hiện tại; không thay chính sách xác thực của cả hệ thống trong lượt này.
- Danh sách sắp xếp `created_at DESC`; tài khoản vừa tạo được đưa lên đầu, xóa bộ lọc cũ và về trang 1. Response tải danh sách cũ không ghi đè lên kết quả mới.
- Tài khoản mới vẫn `INACTIVE`; điều kiện bật sẵn sàng nhận đơn trước chỉ định/tự nhận/nhận nhóm vẫn giữ và được regression test.

### Timeout đăng nhập

Expo shipper đang cấu hình một IP LAN cũ. Web localhost trước đây gọi thẳng IP đó nên hết timeout 15 giây. Resolver mới dùng Gateway theo hostname của trang đang mở; localhost dùng IPv4 `127.0.0.1:3000`. Native development dùng địa chỉ Metro hiện tại; vẫn tôn trọng endpoint public và cấu hình web riêng.

Đã xác nhận tài khoản trong ảnh **đã tồn tại** trước khi gọi login, tránh luồng demo tự tạo tài khoản. Lượt xác nhận cuối qua Gateway local: **HTTP 201, 123 ms**, có token và shipper. Không lưu token/mật khẩu vào artifacts. [Runtime](login-runtime.json).

Đã build và cập nhật **riêng Order service** sau 227 tests. Container running, restart count 0. Không chạy migration/seed/reset DB, không cập nhật các stack khác hay Kubernetes/AWS. SDK map local trên dev server shipper trả HTTP 200.

## Banner ảnh toàn khung

Theo lựa chọn “kết hợp Noel với banner đẹp sẵn có”: Home và Order mỗi trang **4 ảnh**, tổng cộng 8 nội dung khác nhau; web và mobile dùng cùng bộ ảnh theo từng trang. Không thêm khung chữ bên trái, headline hoặc caption phủ ảnh. Có chuyển ảnh, chỉ báo slide và tạm dừng; reduced motion tắt tự chuyển. Hình sản phẩm/ảnh tư liệu được giữ tỷ lệ và căn khung phù hợp.

| Home | Order |
|---|---|
| Noel tại Highlands, quà và cà phê | PhinDi Matcha Dâu |
| Highlands 1.000 cửa hàng | Americano |
| Highlands Matcha Latte / Dừa Mây | Tiệc Noel tại Highlands |
| Không gian cửa hàng Highlands | Nhóm khách với cà phê Highlands |

Ảnh chiến dịch có sẵn ở `web-customer/public/hc-assets`; ảnh Noel từ [bài ảnh Highlands Careers](https://careers.highlandscoffee.com.vn/vi/khong-khi-noel-tran-ngap-khap-cac-van-phong-highlands-coffee/). Ảnh tiệc Noel: `https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/01/1703254106092.jpg`. Không thêm chương trình khuyến mãi mới.

[Home desktop](banner-home-banner-2.png), [Home mobile](banner-mobile-home-banner.png), [Order desktop](banner-order-banner-1.png), [Order mobile](banner-mobile-order-banner.png). Cả 8 ảnh desktop nằm trong thư mục này.

## Bản đồ

- Customer web, Customer Expo Web (theo dõi + cửa hàng), Shipper Expo Web (đơn lẻ + giao ghép) dùng **MapLibre vector Street của Vietmap** khi cấu hình Tile key hỗ trợ. Vector vẽ chữ/đường/POI theo độ phân giải màn hình, thay cho chỉ phóng ảnh raster.
- SDK được phục vụ local và chỉ tải khi mở bản đồ; shipper không còn chờ CDN để tải Leaflet. Có license và SHA256 ở các thư mục `public/map-libs`.
- Khi renderer/style/WebGL lỗi, giữ nền raster, ghim, định tâm và tuyến hiện có. Đã test style 403 bằng fixture.
- iOS/Android customer (theo dõi, cửa hàng) và shipper (đơn lẻ, giao ghép) thêm lớp Vietmap retina **512px**, bật POI/buildings và màu nền chi tiết ở nền native hỗ trợ. Chưa chuyển sang SDK native mới yêu cầu custom dev build.
- Trang giao ghép web trước đây báo không hỗ trợ Web; đã có bản đồ các điểm dừng và tuyến, cùng bảng thao tác bên dưới. Căn camera và tách lớp để bảng thao tác không bị bản đồ che. Attribution luôn có chỗ hiển thị.
- Không thay thuật toán giao ghép/ước lượng quãng đường hiện hữu trong lượt thiết kế này. Các số liệu của giao ghép chưa phải qualification routing thực tế.

Provider/style theo [Vietmap Tilemap](https://maps.vietmap.vn/docs/map-api/tilemap/). **Không dùng key của người dùng để test**: ảnh bản đồ trong artifacts sử dụng style/đường/POI giả lập với renderer MapLibre thật, không phải ảnh nền Vietmap thực tế. Native đã export Android/iOS thành công; chưa QA trên thiết bị thật hoặc provider thật.

[Customer web](maps-customer_web-journey-1000.png), [Customer mobile web](maps-customer_mobile-journey-390.png), [Shipper](maps-shipper-journey-390.png), [Giao ghép](maps-shipper-batch-journey-390.png).

## Kiểm tra và performance

- **371 tests PASS**: Order 227, Web Customer 80, Customer Mobile 34, Web Admin 23, Shipper 7. Bộ HTTP tests có listener loopback bị sandbox EPERM ở lần đầu; chạy lại đầy đủ với quyền bind loopback, giữ nguyên assertions.
- Build Web Customer/Admin và Expo Customer/Shipper Web/Android/iOS PASS. Kiểm tra lint các file web mới/sửa PASS với cấu hình runtime; customer có tắt các rule React compiler/unused đang dùng trong repo. Không coi đây là full repository lint.
- QA banner 4+4, hiện/ẩn mật khẩu, loại kiosk/xe đạp, tạo tài khoản từ trang 2 rồi hiển thị đầu trang 1 và login qua host đúng: PASS, dùng API giả lập.
- QA vector 3 app, fallback style lỗi và bản đồ giao ghép; regression 59 tab thuộc Admin/Manager/Staff/Partner/Accountant: PASS.
- Chat chọn nhiều món + tùy chọn/số lượng và inbox web/mobile: 7 scenarios PASS với AI/chat API giả lập.
- QA performance với GET giỏ chậm giả lập 1.000 ms và POST 200 ms: thêm giỏ **1.361 → 326 ms**, GET giỏ dư **1 → 0**, tải toàn bộ chi nhánh chỉ để duyệt menu **1 → 0**. Đây là phép đo có kiểm soát, không phải latency production.
- Main JS Web Customer **621,91 KB**, so với baseline trước lượt performance 794,48 KB. MapLibre được tải riêng khi mở bản đồ. Các sửa cache/reconciliation, lazy loading, countdown và render cards ở [lượt trước](../holiday-support-performance-20261014/README.md) được giữ.

[Tests/build](checks.json), [Banner và shipper UI](banner-checks.json), [Maps/5 actor](maps-checks.json), [Performance](performance-checks.json), [Source SHA256](source-sha256.json).

Scripts tại root: `scripts/verification/shipper-banner-ui.mjs`, `scripts/verification/maps-actors-ui.mjs`, `scripts/verification/customer-holiday-performance-ui.mjs`, `scripts/verification/customer-staff-ui.mjs`. Export test đặt `EXPO_NO_DOTENV=1`, dùng `fixture-only` cho Maps/Google client; Playwright chặn mọi API/provider/WebSocket ngoài server static. Không test AI/payment bằng key thật, không tạo tài khoản/đơn giả trong DB thật.

Web dev đang mount source: refresh để nhận thay đổi. Nếu Expo đang giữ bundle cũ, reload trang/app; customer cần restart Metro nếu chưa nhận cấu hình watch folders của lượt trước (`npx expo start -c` trong đúng thư mục app).

## Popup quảng cáo căn giữa

Bổ sung theo phản hồi lúc 23:04: reset CSS đã bỏ margin mặc định của native dialog. Khai báo riêng `.campaign-dialog` với `position: fixed; inset: 0; margin: auto` để căn giữa cả hai chiều. Kiểm tra bản build ở 1440×900, 390×844, 844×390 và 1971×951: tâm popup trùng tâm viewport, không vượt màn hình, nút đóng hoạt động. Toàn bộ API được giả lập.

[Desktop](popup-1440x900.png), [điện thoại](popup-390x844.png), [kiểm tra tọa độ](popup-center-checks.json).
