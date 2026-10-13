# AppShipper UX/UI — 12/10/2026

## Thiết kế đã cập nhật

- Trang công việc: lời chào theo tài khoản, cửa hàng được phân công, thẻ thu nhập hôm nay, trạng thái nhận đơn, lối tắt lịch/thu nhập/giao ghép, tìm mã đơn/người nhận/địa chỉ và bộ lọc đơn mới/đang giao.
- Đăng nhập: nhận diện Avengers, minh họa tuyến lấy/giao bằng icon, trường nhập rõ trạng thái, hiện/ẩn mật khẩu, thông báo lỗi và trạng thái đang xử lý.
- Ví & COD: phân biệt số dư, tiền thu hộ và phí giao đã ghi nhận. Nộp COD là gửi yêu cầu chờ cửa hàng xác nhận.
- Báo cáo: ngày/7 ngày/tháng, phí của đơn hoàn thành, tỷ lệ giao thành công và thời gian giao chỉ khi có timestamp thật. Lịch sử và danh sách phí phân trang 10 dòng.
- Hồ sơ: thông tin thật, điều hướng lịch làm/xe/giao ghép/thông báo/ngoại lệ/thu nhập; xác nhận đăng xuất.
- Chi tiết đơn: header gọn, điểm lấy/điểm giao, người nhận, COD/phí giao riêng biệt, thao tác theo trạng thái; hỗ trợ lấy hàng từ trạng thái CONFIRMED.
- Bản đồ đơn lẻ trên web: tải Leaflet khi vào màn, điểm lấy/giao/tài xế từ dữ liệu trả về, trạng thái tải/lỗi và mở điều hướng. Có tuyến đường khi cấu hình Vietmap; thiếu tọa độ thì hiển thị trạng thái thiếu dữ liệu.
- Menu dưới giữ trên các trang phụ; nhãn dưới icon để vừa khung 320 px. Lịch tuần chia đều chiều rộng và màu ngày được chọn rõ ràng.
- Lazy section, danh sách virtualized, skeleton pulse, hiệu ứng xuất hiện nhẹ; tôn trọng thiết lập giảm chuyển động. Modal xác nhận trên web có cuộn và giới hạn chiều cao. Modal chụp ảnh native/ngoại lệ có giới hạn kích thước và hỗ trợ đóng trên Android.
- Nút mô phỏng native/ảnh demo chỉ hiện khi `EXPO_PUBLIC_ENABLE_DELIVERY_SIMULATION=true`; mặc định ẩn.

Tham khảo cách tổ chức dashboard, lối tắt và card trong ảnh ViettelPost người dùng cung cấp và [trang giới thiệu ViettelPost](https://fly.viettelpost.vn/); cách chia kết quả thu nhập theo thời gian trong [Grab in-app statement](https://www.grab.com/vn/in-app-statement/). Giữ nhận diện và nghiệp vụ Avengers.

## Dữ liệu và hợp đồng API

Backend hiện có `/shippers/:id/deliveries`, `/stats`, `/wallet`, `/profile`, `/vehicle`, `/schedule`, `/notifications`, `/active-batch`; không có endpoint `/report` hoặc `/transactions` như giao diện cũ gọi.

Thu nhập được tổng hợp từ `delivery_fee` của đơn `DELIVERED`, theo ngày hoàn thành; không cộng COD, đơn thất bại hay tự điền phí 15.000đ. Thiếu phí/thời gian trả về trạng thái chưa cập nhật. Danh sách trong ví được gọi là **phí giao đã ghi nhận**, không phải sổ giao dịch ngân hàng. Ví lấy trực tiếp từ API, không thay lỗi API bằng số dư giả. Tiền COD các đơn đang giao chỉ dùng `cod_amount`, không thay bằng toàn bộ giá trị đơn trả trước.

Sửa body báo cáo sự cố dùng `type` đúng controller hiện tại; sửa invalidation query lịch/phương tiện theo TanStack Query v5. Không thay schema hoặc tạo dữ liệu đơn giao để trang đẹp hơn.

## Kiểm tra đã chạy

Trong `apps/shipper-mobile`:

```sh
node --test tests/deliverySummary.test.mjs
npx eslint src App.js --no-eslintrc --env browser,node,es2022 --parser-options '{"ecmaVersion":2022,"sourceType":"module","ecmaFeatures":{"jsx":true}}' --rule 'no-undef:error'
EXPO_PUBLIC_API_URL_WEB=http://127.0.0.1:3000 npx expo export --platform all --output-dir /tmp/avengers-shipper-all
```

- 4 kiểm tra tính thu nhập/ngày/fee thiếu/fee 0 đã qua.
- Kiểm tra cú pháp và biến chưa định nghĩa đã qua.
- Expo xuất bundle web, iOS và Android thành công; đây là export bundle, không phải biên dịch IPA/APK.
- Chrome preview `http://127.0.0.1:8772`, API local cổng 3000: đăng nhập, công việc, ví, báo cáo, hồ sơ, lịch làm, phương tiện và xác nhận đăng xuất/hủy; kiểm tra khung 480 px và 320 px. Menu vẫn hiển thị trên trang phụ; modal xác nhận vừa màn hình. Tài khoản kiểm tra có dữ liệu hồ sơ/ví và không có đơn đang giao, nên trạng thái danh sách trống lấy từ API thật.

## Giới hạn kiểm tra

Chưa kiểm tra thực địa GPS nền, camera/POD và điều hướng native trên thiết bị iOS/Android. Không gửi yêu cầu nộp COD, tạo/nhận/hoàn tất đơn thật, hay báo cáo ngoại lệ khi kiểm tra giao diện. Bản đồ và chi tiết với đơn có dữ liệu cần kiểm tra tiếp bằng đơn thử được chỉ định; các luồng native gốc vẫn được giữ.

Preview web dùng Leaflet/Vietmap khi có key; thiếu key dùng OSM. Bản đồ giao ghép native vẫn dùng react-native-maps. Bản web không thay thế kiểm tra quyền và hành vi GPS/camera native.
