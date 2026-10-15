# Customer: Noel, tuyển dụng/hỗ trợ, bản đồ và hiệu năng — 14/10/2026

## Các thay đổi đã hoàn thành

- Trang chính `?tab=other-group` có hero, hai hướng tuyển dụng/hỗ trợ và liên kết nhanh tới tra cứu đơn, cửa hàng, thành viên. Các CTA đi tới trang thật đang có; đã kiểm tra desktop 1440px và điện thoại 390px. Sửa luôn link tuyển dụng ở Home đang dẫn nhầm tới cửa hàng; bổ sung bản dịch tiếng Anh cho nội dung mới.
- Home và Order web dùng banner Noel nền xanh thông, chữ kem và ảnh Highlands lưu local. Home/Menu mobile dùng cùng ảnh Noel Highlands; bỏ ảnh cảm hứng từ thương hiệu khác. Slider có nút chuyển ảnh, tạm dừng và tôn trọng giảm chuyển động.
- Giữ provider hiện có. Vietmap tiếp tục dùng tile `@2x`; fallback OpenStreetMap hỗ trợ Retina. Bản đồ cửa hàng web/mobile web dùng Leaflet và ghim cửa hàng, đổi lựa chọn bằng camera thay cho tải lại iframe. Giới hạn 60 ghim gần vị trí đang chọn; danh sách web dựng 20 mục trước, có nút xem thêm. Google Maps chỉ còn liên kết chỉ đường bên ngoài.
- Bản đồ theo dõi customer có canvas riêng, bảng thông tin phía dưới, nút định tâm và zoom ở vị trí dễ bấm. Fit camera theo toàn bộ cửa hàng/tài xế/điểm giao; bảng tiến trình không che tuyến. Ghim SVG và nhãn gọn; lớp bản đồ không nổi đè lên header. Native customer cũng đưa thông tin xuống dưới canvas. Không dựng vị trí tài xế hoặc ETA giả khi thiếu dữ liệu.
- Tuyến web giữ geometry khi đang cập nhật GPS, dùng cache tối đa 20 tuyến/30 giây với ô tọa độ khoảng 100m. Tài xế vẫn cập nhật vị trí trực tiếp; thời gian tuyến là ước lượng từ provider, không phải cam kết thời gian đến.

## Hiệu năng và thao tác

- POST/PATCH/DELETE giỏ hàng dùng ngay **envelope đầy đủ đã được server xác nhận**. Guard theo chủ giỏ và `cart_version` ngăn response đến muộn ghi đè phiên bản mới; deployment cũ trả response thiếu envelope vẫn có đường refetch. Không dùng giá hoặc dòng giỏ giả để báo thành công.
- Loại GET giỏ thừa và event refetch trùng. Web khóa nút số lượng/xóa khi đang gửi để tránh ghi trùng; lỗi cập nhật được hiển thị, checkout chờ mutation. Mobile tách cập nhật quote khỏi trạng thái bận của thao tác món, đồng thời giữ chặn checkout khi quote chưa được xác nhận.
- Thao tác giỏ/quote/chat không còn xóa toàn bộ cache dữ liệu công khai. TTL và kiểm tra tồn kho/giá tại checkout giữ nguyên.
- Order không tải toàn bộ danh sách chi nhánh/provinces khi chỉ xem menu; dữ liệu địa chỉ vẫn tải tại giỏ/checkout/profile/cửa hàng. Countdown nằm trong component riêng, tránh render lại toàn bộ thực đơn mỗi giây; xử lý scroll gom theo frame.
- Thẻ sản phẩm mobile hiện ngay, không bị giữ opacity 0 cho tới khi viewability/animation hoàn tất. Animation có thể bị hủy rồi tiếp tục mà không làm thẻ biến mất; hiệu ứng chuyển động chỉ còn phụ trợ.
- Chat và lịch sử đơn tải riêng; giữ launcher tức thời và warm chat khi trình duyệt rảnh. Menu warm khi idle, trang trong header preload theo hover/focus. Bundle entry chính giảm **794,48 KB → 621,62 KB**, khoảng **21,8%**; đây là dung lượng chunk chính, không phải tổng mọi tài nguyên sau warm-up.

### Phép đo trước/sau bằng API giả lập chậm

Chạy Chromium trên hai production exports với cùng 118 sản phẩm/1.215 chi nhánh. POST giỏ delay 200ms, GET giỏ delay 1.000ms; tất cả API/provider/socket bên ngoài được intercept. Đo từ click “Thêm vào giỏ hàng” tới modal đóng:

| | Trước | Sau |
|---|---:|---:|
| Thao tác hoàn tất | 1.343ms | 327ms |
| GET giỏ phát sinh sau POST | 1 | 0 |
| GET toàn bộ chi nhánh khi browse menu | 1 | 0 |

Đã kiểm tra riêng PATCH số lượng: nút bị khóa trong request, số lượng xác nhận lên 2 và không thêm GET giỏ. Đây là phép đo có kiểm soát; không phải benchmark độ trễ của backend thực tế.

Một lượt **GET chỉ đọc, không key** tại Gateway local: sản phẩm 3,331s, danh mục 0,076s, chi nhánh 1,161s, đều HTTP 200. Độ trễ lần tải lạnh từ máy chủ vẫn tồn tại; chưa instrument riêng SQL/network để kết luận nguyên nhân. Logs 20 phút của web/Gateway/Order: 0 dòng ERROR trong mẫu đã kiểm tra.

## Kiểm tra

- **114 unit tests PASS**: web customer 80, customer mobile 34; gồm guard phiên bản/chủ giỏ, guest handoff, chat/choices và tuyến đường.
- Vite customer/admin và Expo customer web/iOS/Android, shipper web, admin mobile export thành công. Native là kiểm tra bundle Hermes, chưa chạy thiết bị/emulator.
- QA Home/Order/trang tuyển dụng-hỗ trợ/cửa hàng desktop-mobile; Home/Menu/Stores mobile; quantity PATCH và phép đo trước/sau PASS.
- Regression chat chọn nhiều món/tùy chọn/số lượng, inbox manager/staff web/mobile và cột menu: 7 scenarios PASS.
- Bản đồ customer web/mobile/shipper và phân trang 5 actor, 59 tab PASS. Nền/tuyến trong ảnh QA là fixture; không gọi provider bằng key của người dùng để thử độ nét ngoài thực tế.
- Runtime lint trên các file chính đã chỉnh PASS; đây là check có tắt các quy tắc React compiler/unused hiện hữu, không phải full repository lint. `git diff --check` PASS.

[Checks](checks.json), [phép đo và responsive](performance-checks.json), [bản đồ và các actor](maps-checks.json).

## Ảnh để xem thay đổi

- [Trang tuyển dụng & hỗ trợ desktop](other-group-1440.png), [điện thoại](other-group-390.png).
- [Home web](home-1440.png), [Home điện thoại](home-390.png), [Order web](order-1440.png).
- [Home mobile](mobile-home-390.png), [Menu mobile](mobile-menu-390.png).
- [Bản đồ cửa hàng web](stores-1440.png), [mobile](mobile-stores-390.png).
- [Theo dõi customer web](customer_web-journey-1000.png), [mobile](customer_mobile-journey-390.png), [shipper](shipper-journey-1000.png).

## Nguồn ảnh và chạy lại

Ảnh tư liệu Noel từ [Highlands Careers](https://careers.highlandscoffee.com.vn/vi/khong-khi-noel-tran-ngap-khap-cac-van-phong-highlands-coffee/), bài ảnh lưu ở thư mục 01/2024. Dùng làm hero mùa lễ hội; không gắn thông tin khuyến mãi mới:

- `highlands-christmas-office.jpg`: `https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/01/1702873233774.jpg`.
- `highlands-christmas-team.jpg`: `https://careers.highlandscoffee.com.vn/wp-content/uploads/2024/01/1703254087483.jpg`.

Web dev Docker đang mount source, refresh trang để nhận thay đổi. Customer Expo cần khởi động lại Metro với `npx expo start -c` do thêm module dùng chung. Scripts QA tại root: `scripts/verification/customer-holiday-performance-ui.mjs`, `scripts/verification/customer-staff-ui.mjs`, `scripts/verification/maps-actors-ui.mjs`; dùng các biến `*_EXPORT`, `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE` và `UI_ARTIFACTS`.

Không dùng API key của người dùng để test, không gọi AI/payment/provider thực, không tạo đơn hoặc sửa DB thật. Không commit/push; không thay Kubernetes/AWS hay báo cáo capacity.
