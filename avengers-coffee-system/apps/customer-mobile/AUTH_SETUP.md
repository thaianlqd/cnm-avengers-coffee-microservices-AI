# Đăng nhập customer mobile và triển khai

Mobile dùng cùng backend và tài khoản với web-customer. Đăng nhập/đăng ký email, Google và khôi phục mật khẩu không có database hoặc hệ thống OTP riêng.

## Hợp đồng đang dùng

| Luồng | API | Kết quả |
| --- | --- | --- |
| Đăng nhập | `POST /auth/login` | JWT hệ thống + hồ sơ, lưu phiên và chuyển giỏ khách |
| Đăng ký email | `POST /auth/register` | Tạo customer, quay về đăng nhập |
| Google đăng nhập/đăng ký | `POST /auth/google` | Token Google đã xác minh; tài khoản mới được tạo tự động, tài khoản cũ được dùng lại |
| Quên mật khẩu | `POST /auth/forgot-password/request` | Gửi OTP qua email tài khoản; thông báo không tiết lộ tài khoản có tồn tại |
| Đặt lại mật khẩu | `POST /auth/forgot-password/reset` | Kiểm tra OTP và lưu mật khẩu mới, quay về đăng nhập |

Mật khẩu giữ nguyên khoảng trắng, không trim. OTP gồm 6 số, hạn 10 phút, tối đa 5 lần nhập sai, gửi lại cách nhau 60 giây theo backend. UI chống double-click, giữ form khi lỗi, có hiện/ẩn mật khẩu và trạng thái đang xử lý. Token Google chỉ dùng để đổi lấy JWT backend; không lưu token Google vào storage. Tài khoản bị vô hiệu hóa không được kích hoạt lại bởi Google.

## Cấu hình một lần

Copy các biến cần thiết từ `.env.example` vào môi trường build; giữ các biến map/socket hiện có. Không ghi client secret, SMTP password hoặc JWT secret vào app.

| Biến | Nơi đặt | Giá trị |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | Mobile/web bundle | URL HTTPS gateway, không dùng localhost/LAN khi phát hành |
| `EXPO_PUBLIC_SOCKET_URL` | Mobile/web bundle | URL HTTPS chat/socket đã triển khai |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Mobile/web bundle | OAuth client loại **Web application**, cùng project với client native |
| `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` | Mobile web bundle | Public site key reCAPTCHA v2 checkbox dùng cùng web; cho phép localhost và domain phát hành |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Mobile/iOS build | OAuth client loại **iOS**, bundle ID `com.avengers.coffee.customer` |
| `WEB_CUSTOMER_GOOGLE_CLIENT_ID` | Root Compose environment | Cùng Web client ID dùng trên web và mobile |
| `CUSTOMER_MOBILE_GOOGLE_IOS_CLIENT_ID` | Root Compose environment | Cùng iOS client ID của mobile |
| `CUSTOMER_MOBILE_GOOGLE_ANDROID_CLIENT_ID` | Root Compose environment | OAuth client Android tương ứng package và chữ ký bản phát hành |

Compose truyền ba client ID vào `GOOGLE_ALLOWED_CLIENT_IDS` của identity-service. Backend kiểm tra chữ ký/audience của ID token bằng `google-auth-library`; access token được kiểm tra audience/hạn và hồ sơ Google trước khi tạo phiên. Thiếu audience cấu hình sẽ từ chối Google, vẫn dùng được đăng nhập email.

Trong Google Cloud Console, cấu hình consent screen và các OAuth client:

1. **Web:** thêm đúng Authorized JavaScript origins của web-customer và Expo web, gồm domain HTTPS phát hành. Local cần cả `http://localhost:8090` và `http://127.0.0.1:8090` nếu dùng cả hai; thêm origin web-customer riêng. Flow popup hiện tại không dùng redirect URI của app.
2. **Android:** package `com.avengers.coffee.customer`, SHA-1 đúng keystore đang ký APK/AAB. Debug, EAS preview và Google Play App Signing có thể có SHA-1 khác nhau, phải đăng ký các client tương ứng. Android SDK lấy cấu hình từ package/chữ ký; không đặt Android client ID vào biến Web client ID. Backend phải cho phép audience của các bản đang phát hành.
3. **iOS:** bundle ID `com.avengers.coffee.customer`. `app.config.js` tự thêm URL scheme `com.googleusercontent.apps.<prefix>` từ iOS client ID vào config plugin. Sau khi thêm/đổi ID hoặc scheme, phải rebuild native.
4. Khi consent screen còn ở chế độ Testing, thêm tài khoản test cần dùng. Kiểm tra domain và chính sách consent trước phát hành.

Nếu có nhiều Android client cho debug/preview/production, có thể truyền danh sách client ID phân cách dấu phẩy trong `CUSTOMER_MOBILE_GOOGLE_ANDROID_CLIENT_ID`; backend sẽ tách và deduplicate.

## Build và phát hành

Web dùng Google Identity Services popup; Android/iOS dùng native Google Sign-In SDK. Native Google cần bản app đã build, **không chạy trong Expo Go**. Trong Expo Go, Google bị vô hiệu hóa với hướng dẫn dùng email; màn hình không import native module khi chưa hỗ trợ. Xem [tài liệu Google Sign-In với Expo](https://react-native-google-signin.github.io/docs/setting-up/expo).

Ngày 13/10/2026: đã xác nhận lỗi `origin_mismatch` do thiếu origin mobile web trên client Web client 2. Sau xác nhận người dùng, đã thêm và lưu `http://localhost:8090` cùng `http://127.0.0.1:8090`; Google Cloud báo `OAuth client saved`. Không thay scope, redirect URI, secret hay các origin web cũ. Google có thể mất vài phút đến vài giờ để áp dụng cấu hình; tải lại app và thử lại cửa sổ đăng nhập. Khi deploy, thêm đúng origin HTTPS thực tế tương ứng, không sử dụng wildcard hoặc tự động tin origin từ request.

Mobile web dùng sheet xác thực CAPTCHA rồi chọn Google khi có public site key hợp lệ. Token CAPTCHA được kiểm tra qua `/auth/recaptcha/verify` trước đổi token Google; lỗi/hết hạn/hủy không tạo phiên. Backend cần `RECAPTCHA_SECRET_KEY` hợp lệ để verify thật: endpoint hiện có trả thông báo dev mode nếu thiếu secret, không coi đó là bằng chứng chống bot production. CAPTCHA và việc chọn tài khoản là hai bước UI; xác thực hai yếu tố tài khoản là màn hình của Google và vẫn do Google xử lý. Không giải CAPTCHA hoặc đăng nhập tài khoản thật trong fixture QA.

Để thử native local sau khi đã cấu hình OAuth: `npm run android` hoặc `npm run ios`. Để phát hành qua EAS, liên kết project với tài khoản Expo của chủ ứng dụng, đặt biến public ở môi trường `preview`/`production` với visibility Plain text hoặc Sensitive để cả config và bundle đọc được. Xem [biến môi trường EAS](https://docs.expo.dev/eas/environment-variables/).

`eas.json` đã có hai profile: preview tạo APK Android cài thử; production dùng cấu hình store mặc định. Chạy `npx eas-cli build --platform android --profile preview` để qualification, rồi `--profile production` để phát hành; đổi `--platform ios` khi build iOS. iOS cần signing/provisioning tương ứng. Không đưa bản preview lên store. Chưa gửi build cloud hoặc submit store trong lượt sửa này. Xem [cấu hình EAS Build](https://docs.expo.dev/build/eas-json/).

Web có thể xuất bằng `npx expo export --platform web --output-dir dist` và host thư mục `dist`. Biến `EXPO_PUBLIC_*` được nhúng lúc build, thay môi trường server sau đó không thay nội dung bundle; rebuild khi đổi API/client ID. Backend dùng image mới của identity-service và env Compose mới; không cần thay schema hoặc restart dịch vụ không liên quan.

SMTP backend cần hoạt động để OTP đến hộp thư. SMTP lỗi trả `503` và thời gian chờ, không trả thành công giả hoặc log OTP. Cấu hình `SMTP_*` chỉ ở backend hoặc trang cấu hình SMTP hiện có.

## Kiểm chứng trước phát hành

- Chạy `node --test tests/*.test.mjs`, export web/iOS/Android; backend `npm test -- --runInBand` và `npm run build`.
- `python3 tools/check-auth-ui.py <URL Expo web>` kiểm tra form, Google SDK/API giả lập, OTP, double-click, lưu phiên/giỏ và các khung 320/390/480/1440 px. Script cần Python Playwright/Chromium. Không gửi email hoặc đăng nhập Google thật.
- Trên bản signed dùng domain/API phát hành: kiểm tra Google đăng nhập tài khoản cũ, Google tạo customer mới, hủy popup, tài khoản vô hiệu hóa, mạng mất; kiểm tra OTP email thật, sai/hết hạn/gửi lại và đăng nhập bằng mật khẩu mới; reload/reopen app phải giữ phiên và giỏ đúng chủ sở hữu.
- Bundle export và fixture QA không thay thế qualification OAuth với Google Cloud, thiết bị thật hoặc SMTP thật. Hiện iOS/Android OAuth client và signing credentials chưa được cung cấp; chỉ có Web client ID local. Không tự tạo giả client ID hoặc tuyên bố Google native đã đăng nhập thành công.
