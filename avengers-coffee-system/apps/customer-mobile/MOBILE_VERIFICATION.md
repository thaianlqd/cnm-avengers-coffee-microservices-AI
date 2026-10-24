# Customer mobile — kiểm tra ngày 12/10/2026

## Cập nhật tài khoản/thông báo — 13/10/2026

- Thẻ tài khoản nền đỏ thương hiệu, trang trí vòng mảnh, chữ gọn và mã thành viên có ellipsis trong đúng chiều rộng. Avatar dùng hồ sơ API, kể cả phiên đăng nhập cũ chưa chứa ảnh; trang chủ dùng lại profile cache sau khi mở tài khoản, không thêm request chỉ để lấy ảnh cache.
- Nút ưu đãi/thông báo, badge và các nền cảnh báo dùng mặt nền trung tính thay vàng nhạt. Thông báo có lọc tất cả/chưa đọc, thao tác đọc tất cả, trạng thái tải/lỗi/rỗng; nhãn trạng thái đơn đọc được và UUID rút gọn chỉ ở phần trình bày, dữ liệu điều hướng giữ ID đầy đủ.
- TextInput chung cho các màn hình loại viền browser lồng bên trong và đánh dấu không tích hợp Grammarly trên ô nhập. Vẫn có caret, nhãn và viền đỏ trên field khi focus; giữ focus bàn phím của các nút. Native giữ hành vi input hệ điều hành.
- Ba ảnh editorial cũ được thay bởi ảnh Highlands tại Home/News/detail; asset local và `expo-image` cache, không sửa ảnh tùy chỉnh do admin đăng. Nguồn trong `assets/news/README.md`, đồng bộ với web-customer.
- Google mobile web có bước reCAPTCHA v2 khi cấu hình public site key, rồi chọn tài khoản Google, verify CAPTCHA qua endpoint hiện có trước đổi token lấy session. Hủy popup và lỗi xác thực không lưu phiên. Xác thực hai yếu tố tài khoản Google do Google xử lý trong cửa sổ của họ. Native vẫn dùng SDK hệ điều hành; không đưa checkbox web vào native.
- Google Cloud client Web client 2 đã lưu thêm `http://localhost:8090` và `http://127.0.0.1:8090` sau xác nhận người dùng. Bốn origin cũ giữ nguyên; Google Cloud báo `OAuth client saved`. Chưa thực hiện đăng nhập tài khoản thật/CAPTCHA thật hoặc đăng ký Google native trong lượt này.

QA: 22 mobile unit tests, export web/iOS/Android và scoped `no-undef` pass. Fixture Chromium kiểm tra tài khoản/avatar API, filter/read-all, input search/profile và ảnh Highlands; auth test gồm Google/CAPTCHA giả lập, OTP, email signup, popup cancel/error, session/capability cart merge. Không có profile/order/email/provider write thật. Khung 320/390/480/1440 px không tràn ngang, không page runtime error. Bằng chứng `artifacts/account-ui/`.

Startup đã bỏ chờ catalog; fixture catalog chậm 3 giây vẫn hiện trang chủ trước. Splash cùng nền logo, title có fallback. Xem báo cáo performance/ENG-VIE trong `../web-customer/PERFORMANCE_LANGUAGE_VERIFICATION.md`; số đo dev/fixture không phải SLA production.

## Phần đã hoàn thành

- Splash nền đỏ/logo trước khi vào app, header trắng gọn, trang chủ có tên/hạng/tiến độ thành viên, số dư ví và điểm từ API hiện có. Banner dùng tài nguyên thương hiệu sẵn có.
- Tìm món có dấu/không dấu hoạt động ở trang chủ và thực đơn. Danh mục ảnh nằm ngang, thực đơn hai cột/chế độ danh sách. Nút chi tiết mở trang sản phẩm riêng; nút thêm mở cấu hình món.
- Popup giới hạn trong khung app tối đa 480px, nội dung cuộn và nút thao tác luôn tiếp cận được. Đã kiểm tra khung 320px. Năm tab dưới giữ trên trang phụ, chi tiết sản phẩm/cửa hàng, đơn hàng và tracking.
- Sản phẩm, cửa hàng, đơn hàng, voucher, tin tức, đánh giá và giao dịch ví chia tối đa 10 mục/trang. Thay đổi bộ lọc trả về trang đầu; API đơn hàng lấy tổng thực để chuyển trang chính xác.
- Size/topping/sữa/đá/độ ngọt từ thuộc tính catalog thật, không tạo lựa chọn cho món không hỗ trợ. Giỏ dùng cache theo chủ sở hữu, ID dòng giỏ, số lượng server; thêm/sửa có thông báo và badge. Checkout dùng báo giá backend, khả dụng cửa hàng, địa chỉ, voucher và phương thức thanh toán hiện có.
- Trang sản phẩm có mô tả, giá, tình trạng, đánh giá/phản hồi API và các đơn hoàn thành đủ điều kiện đánh giá. Trang cửa hàng có tìm tên/địa chỉ, tỉnh/thành, vị trí, giờ mở cửa, chi tiết và đánh giá.
- Bản đồ cửa hàng trên web preview dùng Google Maps như web-customer. Chọn cửa hàng/trang mới cập nhật bản đồ theo tên/địa chỉ thực; có trạng thái tải và mở Google Maps.
- Tracking web có bản đồ trực tiếp, tuyến đường, điểm cửa hàng/nhận hàng và GPS tài xế khi có. Dùng Vietmap tương ứng cấu hình web-customer; socket kết hợp REST, giữ lần cập nhật thành công khi mất mạng, ngừng đăng ký khi rời màn hình/background. Không dựng vị trí, tên/điện thoại tài xế hay ETA giả. Thời gian tuyến đường khi chưa có GPS được ghi rõ, khác ETA tài xế.
- Chi tiết đơn trình bày theo khối, nhãn thanh toán tiếng Việt, địa chỉ loại thành phần lặp, tên chi nhánh tra từ API, hành trình phân biệt đã xong/đang thực hiện. Sửa/đặt lại/hủy sử dụng hợp đồng backend hiện có.
- Đơn hoàn thành có đánh giá sản phẩm, cửa hàng theo bốn tiêu chí, shipper khi có giao hàng thực và đủ điều kiện. Form không đặt sẵn số sao; không gửi đánh giá trong QA.
- Lazy sections, hiệu ứng xuất hiện theo vùng nhìn thấy, cache ảnh, trạng thái tải/lỗi/rỗng. Hiệu ứng tôn trọng tùy chọn giảm chuyển động.
- Ví chỉ báo nạp thành công khi backend xác nhận SUCCESS. Quà tặng, khảo sát, vòng quay, hỗ trợ dùng API hiện có.

## Kiểm tra đã chạy

- `node --test tests/*.test.mjs`: 16/16 qua, gồm giỏ, giá thuộc tính, giờ cửa hàng, vòng đời tracking, tuyến giao hàng và địa chỉ.
- Order service: 39 bài kiểm tra liên quan quản lý/sửa đơn và phí/tracking qua. Đã build và nạp lại container local order-service để kiểm tra thay đổi tổng phân trang và bỏ thông tin tài xế mẫu.
- `npx expo export --platform all`: xuất bundle web/iOS/Android thành công. ESLint `no-undef`, `git diff --check` qua.
- Web-customer build thành công trong lượt kiểm tra trước; còn cảnh báo chunk lớn.
- Chrome preview 320px: thực đơn hai cột và bộ phân trang, popup cấu hình/quantity/nút lưu nằm trong khung; thêm Mochi Kem Matcha cập nhật badge 1 và giỏ đúng 19.000đ. Đã dọn giỏ thử của phiên khách riêng.
- Chrome/API: tìm `bac xiu`, sửa size/ghi chú/giá, cấu hình tách dòng, idempotency không thêm trùng; chọn hình thức nhận món/cửa hàng đồng bộ thực đơn và giỏ.
- Bản đồ Google tải đường phố Đà Nẵng, phân trang cửa hàng 1–10 / 11–20 cập nhật cửa hàng và bản đồ. Chi tiết sản phẩm trả mô tả/giá/đánh giá thật từ API.
- Phiên đăng nhập: lịch sử tổng 120 đơn, bộ lọc hoàn thành 101 đơn, 10 đơn/trang; tracking đơn đang giao hiển thị tuyến 0,5 km, chờ GPS khi không có vị trí tài xế. Xem đơn hoàn thành và mở form đánh giá sản phẩm/cửa hàng, không gửi thay người dùng.
- Preview mới: http://127.0.0.1:8771 ; preview phiên cũ http://127.0.0.1:8770 cần tải lại để nhận bundle mới. Export preview dùng API 127.0.0.1:3000/socket 3005; giữ địa chỉ LAN trong `.env` cho điện thoại.

## Giới hạn xác minh

Dữ liệu mobile lấy từ API cùng hệ thống web; database local vẫn có các đánh giá seed ghi rõ “[Dữ liệu mẫu]”, không tạo thêm dữ liệu minh họa trong mobile. Chưa thực hiện thanh toán/nạp tiền, tạo đơn giao hàng, gửi email quà tặng, quay thưởng, gửi khảo sát hoặc gửi đánh giá trong QA. Xuất bundle iOS/Android không thay thế kiểm tra thiết bị thật: GPS/quyền thiết bị, map SDK, socket background và hành trình shipper thật cần kiểm tra trên điện thoại. Xem `TRACKING_SETUP.md`.


## Trang chủ lễ hội và khôi phục chat — 13/10/2026

- Trang chủ mở bằng hero ảnh tràn ngang: ba ảnh người dùng chọn, chữ/nút thực đơn đè lên gradient, header có tìm món/chat/giỏ/menu. Menu mở sheet, các liên kết vẫn vào màn hình hiện có. Hero đứng trước thẻ thành viên/ví/tìm kiếm; không loại bỏ chức năng hoặc số liệu API.
- Chuyển ảnh 7 giây, fade 650ms, chọn ảnh thủ công, tạm dừng/tiếp tục. Ngừng khi route mất focus, app background, menu mở hoặc người dùng bật giảm chuyển động. Ảnh lưu cục bộ qua expo-image cache. Nguồn, thương hiệu và giới hạn thumbnail ghi trong `assets/campaigns/README.md`. Hai ảnh Google là ảnh cảm hứng của October/Indoor Coffee, không phải ảnh Highlands; không tạo ưu đãi/món/giá giả từ chữ trong ảnh.
- Lối vào chat ở header, menu và cuối trang; Support cũng mở chat. Chat có tab AI/nhân viên riêng. AI không tự mở hội thoại nhân viên và không tự gửi AI chỉ vì mở/switch tab. Lịch sử AI giữ khi đổi mode trong cùng workspace; thay chủ phiên tạo workspace mới.
- Chat nhân viên dùng đúng REST contract hiện có `/chat/conversations/open`, `messages`, `read`, và socket `/chat` giống web. Hiển thị cả tin khách và tin nhân viên, key cache theo owner/conversation, chống click gửi đang pending, giữ bản nháp khi chưa xác nhận gửi. Không tự retry gửi tin. Socket join/subscribe khi mở/focus/foreground, teardown khi rời; REST polling 5 giây dự phòng, dừng khi rời/background. Trạng thái kết nối không khẳng định nhân viên đang online.

Kiểm tra: 16 test mobile hiện có pass, ESLint `no-undef` ở các file đổi pass, `expo export --platform all` xuất web/iOS/Android pass (artifact `/tmp/customer-holiday-export`). Admin: build/runtime check và 11 test pass; cả 5 ảnh Highlands mới tải đúng/full viewport, không tràn mobile.

Chromium trên Expo local `8090`: kiểm tra hero, ba slide/manual/pause/resume, reduced-motion, menu, history hai chiều, gửi đúng một tin fixture, lỗi giữ bản nháp, Socket.IO event, polling dự phòng và dừng sau rời chat; kiểm tra khung 320/390/480/1440px không runtime exception/tràn ngang. Script `python3 tools/check-holiday-home.py http://127.0.0.1:8090`; cần Python Playwright và Chromium. Kết quả/ảnh ở `artifacts/holiday-home/`.

API/socket trong QA được giả lập; không gửi tin cho nhân viên thật, không gọi provider hoặc tạo đơn/backend data. Chưa đối chiếu tin thật tới console manager, push notification hoặc keyboard/network/socket trên thiết bị thật. Export native không thay thế kiểm tra iOS/Android. Không thay logic/endpoint thanh toán hay dữ liệu catalog. Preview Expo 8090 dùng source qua Metro; tải lại tab để thấy thay đổi. Không triển khai production.

## Logo, ảnh nét và điểm nhấn Noel — 13/10/2026

- Hero dùng logo Highlands gốc `assets/branding/logo.png` (2269 × 1739), giữ tỷ lệ, nền oval trắng; bỏ khối chữ vuông AVENGERS/COFFEE. Tiêu đề 26/33 px thay 31/38 px; giữ tìm kiếm/chat/giỏ/menu.
- Ảnh Highlands chính dùng bản gốc 2048 × 1365 thay 1024 × 683; giảm lớp phủ đầu ảnh và giữ ảnh expo-image không downscale cho hero. Hai thumbnail Google vẫn có giới hạn nguồn như ghi trong README; không upsample hay tái tạo chi tiết/logo giả.
- `HolidayOrnaments.js` vẽ quả châu SVG với radial gradient, highlight, bóng và phối cảnh Animated; không thêm texture/WebGL. Dừng khi rời trang/background/menu/pause/reduced-motion; không chặn thao tác.
- 16/16 tests pass; no-undef ở hai component hero/ornaments pass. `expo export --platform all --output-dir /tmp/customer-polish-export` xuất web/iOS/Android thành công.
- Chạy lại Chromium fixture: hero/menu/chat/carousel/reduced-motion ở 320/390/480/1440 px không lỗi JS/tràn ngang; lịch sử nhân viên, gửi một tin, lỗi giữ nháp, socket/polling vẫn pass. Ảnh/report mới trong `artifacts/holiday-home/`. Chưa kiểm thử thiết bị iOS/Android thật.

## Google, đăng ký và quên mật khẩu — 13/10/2026

- Màn hình đăng nhập mới có logo oval gốc/ảnh Highlands cục bộ, chữ và form gọn, tab đăng nhập/đăng ký, hiện/ẩn mật khẩu, lỗi/thông báo inline, nút đang xử lý; safe area, scroll và tránh bàn phím trên iOS. Không còn banner thương hiệu khác ở màn hình auth.
- Email signup dùng API web hiện có, kiểm tra email/mật khẩu xác nhận rồi quay về login. Google signup/login dùng cùng exchange `/auth/google` và cùng logic session/merge giỏ khách của đăng nhập thường. Không lưu token Google; không điều hướng khi Google bị hủy hoặc phản hồi phiên thiếu user/token.
- Khôi phục mật khẩu gồm yêu cầu mã và OTP + mật khẩu mới/xác nhận. Gửi lại có countdown, xử lý `retry_after_seconds` khi SMTP lỗi; OTP sai giữ input, thành công quay về login. Double-click không gửi trùng trong cùng màn hình; không tự retry mutation. Mật khẩu không trim.
- Backend dùng `google-auth-library` kiểm tra ID token và audience; access token kiểm tra audience/hạn/hồ sơ đã xác minh. Google không kích hoạt lại tài khoản INACTIVE. SMTP thất bại trả 503, không log OTP hoặc báo gửi thành công giả. Không thay schema/API contract đăng nhập cũ.

Kiểm tra cuối:

- Mobile `node --test tests/*.test.mjs`: **20/20 pass**, gồm normalization/signup/reset/raw password/network messages và các regression giỏ/tracking hiện có.
- Identity `npm test -- --runInBand`: **27/27 pass, 6 suites**, gồm xác minh Google, account disabled, OTP hết hạn, lần sai thứ năm, consume mã, khoảng trắng mật khẩu và SMTP lỗi. `npm run build` pass.
- `expo export --platform all --output-dir /tmp/customer-auth-export`: web/iOS/Android pass. `no-undef` scoped với parser ES2022/module/JSX pass; `git diff --check` pass. Export là bundle, chưa phải APK/IPA signed.
- Introspection Expo với iOS client ID fixture xác nhận config plugin tạo đúng URL scheme và package/bundle ID `com.avengers.coffee.customer`. Không dùng fixture ID khi phát hành.
- `python3 tools/check-auth-ui.py http://127.0.0.1:8090` và trên static export 8092: Google cancel/popup lỗi/rejected backend/malformed session; signup double-click đúng một request; OTP gửi lỗi/cooldown/sai/đúng; raw password; một Google exchange thành công, giữ phiên sau reload và merge giỏ; login/register/forgot 320/390/480/1440 px **không lỗi JS hoặc tràn ngang**. Google/API hoàn toàn giả lập; không gửi email, không tạo customer/giỏ thật. Ảnh/report/log ở `artifacts/auth-ui/`.
- Regression trang chủ/chat trên source Expo 8090 pass: hero/menu/carousel/pause/reduced-motion, staff history/socket/polling/draft; không gọi AI hoặc gửi tin nhân viên thật.

Local: đã restart Metro customer 8090 để nhận env mới và giao diện. Image identity đã build và nạp riêng container local; rollback image `avengers-identity:before-mobile-auth-20261013` giữ nguyên. Không triển khai production hoặc gửi build EAS/store. Hướng dẫn cấu hình và build: `AUTH_SETUP.md`, `.env.example`, `eas.json`.

Giới hạn còn lại: local đã có Web client ID, chưa có client iOS/Android/signing credentials. Cần cấu hình Google Cloud origins/audiences/package/SHA-1 và build native trước test Google thật; Google native không chạy trong Expo Go. Chưa xác minh OTP với SMTP/hộp thư thật, OAuth consent trên domain production hoặc thiết bị iOS/Android. Fixture success không được coi là bằng chứng các bước live này đã pass.

## Startup repair — 24/10/2026

Expo web was serving `UnableToResolveError` for `@stomp/stompjs`, imported by the shared realtime tracking module. The dependency was already declared in package.json/package-lock.json but missing from the installed node_modules. Running `npm install --ignore-scripts --no-audit --no-fund` restored it without changing the lockfile. The running Metro server then generated its JavaScript bundle, and Expo web and iOS exports completed successfully. This verifies bundling, not an on-device visual pass.

The static web startup now offers a reload action when its script fails to load or remains unmounted for 15 seconds. It never replaces an app that has already mounted. When dependencies have changed, install from the existing lockfile before starting Expo.
