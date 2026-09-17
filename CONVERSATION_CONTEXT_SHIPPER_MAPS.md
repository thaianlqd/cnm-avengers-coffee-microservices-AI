# BÁO CÁO CONTEXT PHIÊN LÀM VIỆC: HỆ THỐNG SHIPPER MOBILE, BẢN ĐỒ & ĐIỀU HƯỚNG
> **Ngày tạo:** 17/09/2026  
> **Dự án:** Avengers Coffee Microservices System  
> **Module trọng tâm:** `apps/shipper-mobile` & `services/order-service`  
> **Tài liệu dùng để chuyển tiếp sang cuộc trò chuyện mới.**

---

## 1. TỔNG QUAN CÁC NHIỆM VỤ ĐÃ HOÀN THÀNH

Trong phiên làm việc này, toàn bộ các vấn đề liên quan đến hiển thị dữ liệu chi nhánh, làm sạch cơ sở dữ liệu đơn test, chuẩn hoá UX/UI, xử lý toạ độ địa chỉ khách hàng, tích hợp Google Maps và cơ chế chạy ngầm GPS (Background Location Tracking) đã được xử lý triệt để 100%.

---

## 2. CHI TIẾT TỪNG VẤN ĐỀ & GIẢI PHÁP ĐÃ TRIỂN KHAI

### 2.1. Xử lý triệt để tên và địa chỉ Chi Nhánh (Loại bỏ hardcode & ký tự `_`)
- **Vấn đề trước đây:** App Shipper chỉ có mảng tĩnh `KNOWN_BRANCH_DATA` (10 chi nhánh hardcode). Khi gặp mã chi nhánh mới thì backend hoặc frontend hiển thị chuỗi kỹ thuật xấu xí: `Avengers Coffee - MAC_DINH_CHI` hoặc `HCM_VO_OANH`.
- **Giải pháp:**
  - **Tạo mới `apps/shipper-mobile/src/lib/branchHelper.js`**:
    - Kết nối API `GET /users/branches/public` lấy danh sách **1,165 chi nhánh thật** từ `identity-service`.
    - Cache đa tầng: Bộ nhớ RAM + `AsyncStorage` (`shipper_cached_branches_v1`), tự động nạp offline.
    - Thuật toán tra cứu `findBranchByCode()` khớp mã, không dấu, tên đường, loại bỏ tiền tố `HCM_`, `CN_`,...
    - Thuật toán `parseGenericBranchTitle()` tự động format Title Case tiếng Việt, **loại bỏ 100% dấu `_`**.
  - **Cập nhật Backend (`services/order-service/src/modules/shipper/shipper.service.ts`)**:
    - Tự động gọi `identity-service:3001/branches/public` và cache 15 phút.
    - Gán `store_name`, `store_address`, `pickup_address` thực tế vào toàn bộ API Shipper (`getAvailableOrders`, `acceptOrder`, `getAssignedDeliveries`, `getDeliveryDetail`).
  - **Đồng bộ Frontend:** `HomeScreen.js`, `OrderDetailScreen.js`, `MapScreen.js`, `WalletScreen.js`, `BatchOrderScreen.js`.

---

### 2.2. Dọn sạch đơn hàng active của Shipper để test luồng thực tế
- **Thực hiện:**
  - Đã truy vấn trực tiếp vào PostgreSQL `orders`: Xóa sạch toàn bộ **146 bản ghi** đơn hàng test cũ trong bảng `orders.shipper_delivery`.
  - Reset trạng thái toàn bộ shipper về `status = 'ACTIVE'`, `total_deliveries = 0`.
- **Kết quả:** Tab "Tiếp tục giao" trên app Shipper hiện tại trống hoàn toàn (0 đơn), sẵn sàng nhận đơn mới do khách hàng đặt thật.

---

### 2.3. Chuyển tính năng Ghép đơn thành "Tính năng đang phát triển" chuẩn UX/UI
- **Thực hiện:**
  - Xóa bỏ hơn 140 dòng mock logic giả lập (`createDemoBatch`, `handleStartDemoBatch`, state `isBatching`, emoji `🧠`).
  - Thiết kế thẻ thông tin "Tính năng đang phát triển" chuyên nghiệp trên tab `Ghép đơn` của `HomeScreen.js`, màn hình `BatchOrderScreen.js`, và menu `ProfileScreen.js`.
  - Giới thiệu 3 giá trị nổi bật: Tối ưu lộ trình AI, Gia tăng thu nhập, Ghép chuyến tự động. Có nút "Quay lại danh sách nhận đơn".

---

### 2.4. Sửa lỗi sai lệch toạ độ khách hàng (Geocoding Mapbox)
- **Vấn đề trước đây:** Backend cắt bỏ Phường/Quận trong chuỗi địa chỉ giao hàng, làm Mapbox Geocoding nhầm địa chỉ Điện Biên Phủ ở TP.HCM sang tận Bà Rịa / Hồ Tràm (lệch hơn 100km).
- **Giải pháp:**
  - Sửa `services/order-service/src/modules/thanh-toan/thanh-toan.service.ts` và `delivery-tracking.service.ts`: Giữ nguyên 100% địa chỉ đầy đủ và truyền tham số `proximity=${storeLng},${storeLat}` vào Mapbox API để ưu tiên kết quả gần chi nhánh nhất.
  - Rebuild và cập nhật container `avengers_order_service`.
  - Cập nhật lại toạ độ chuẩn `10.788378, 106.695557` trong cơ sở dữ liệu `orders.delivery_tracking`.

---

### 2.5. Chuẩn hóa nút mở Google Maps & Loại bỏ 100% Apple Maps trên iOS
- **Vấn đề trước đây:** Code cũ có `Platform.OS === 'ios' ? appleUrl : googleUrl` với `appleUrl = maps:?daddr=...`. Khi chạy trên iPhone, iOS luôn mở ứng dụng **Bản đồ của Apple (Apple Maps)** và xin quyền vị trí. Apple Maps ở Việt Nam tìm số nhà rất kém.
- **Giải pháp:**
  - Giữ nguyên Mapbox GL làm bản đồ in-app (`MapScreen.js`).
  - **Tạo mới `apps/shipper-mobile/src/lib/navigationHelper.js`**:
    - Xóa sạch 100% scheme `maps:` và `appleUrl`.
    - Ưu tiên truyền chuỗi địa chỉ khách hàng đầy đủ (`customerAddress`) để Google Maps tự tìm chính xác số nhà tại Việt Nam.
    - URL Scheme mở app native: `comgooglemaps://?daddr=${destParam}&directionsmode=driving` (iOS) và `google.navigation:q=${destParam}&mode=d` (Android).
    - Tối ưu gọi `openURL(appSchemeUrl)` trong try-catch, tự động fallback sang website chính thức `https://www.google.com/maps/dir/?api=1&destination=${destParam}&travelmode=driving` nếu máy chưa cài app Google Maps.
  - Thêm `LSApplicationQueriesSchemes: ["comgooglemaps", "googlechromes"]` vào `app.json`.
  - Cập nhật nút **"Mở Google Maps"** màu xanh dương `#2563EB` trên `MapScreen.js`, `OrderDetailScreen.js`, `BatchRouteScreen.js`.

---

### 2.6. Triển khai Background Location Tracking (Chạy ngầm GPS khi shipper mở Google Maps)
- **Vấn đề đặt ra:** Khi Shipper thoát app Avengers Coffee để sang Google Maps lái xe, sau 15-30s iOS/Android sẽ đóng băng (freeze) JavaScript làm khách hàng không theo dõi được xe shipper di chuyển.
- **Giải pháp:**
  - **Cài đặt thư viện:** `expo-task-manager` (~57.0.18).
  - **Cấu hình `app.json`**:
    - iOS: `UIBackgroundModes: ["location", "fetch"]`, `NSLocationAlwaysUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`.
    - Android: `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, plugin `isAndroidBackgroundLocationEnabled: true`, `isAndroidForegroundServiceEnabled: true`.
  - **Tạo mới `apps/shipper-mobile/src/lib/backgroundLocationManager.js`**:
    - Khởi tạo task `AVENGERS_SHIPPER_BACKGROUND_LOCATION` ở cấp độ root module.
    - Đọc session `avengers_shipper_session` từ `AsyncStorage`, bắt toạ độ GPS mới nhất và gửi `PATCH /shippers/${shipperId}/location`.
    - Backend tự động lưu toạ độ và phát WebSocket thời gian thực tới app/web khách hàng.
    - Bật thanh chỉ báo định vị màu xanh trên iOS Status Bar và thông báo Foreground Service trên Android.
    - Tự động bắt lỗi và fallback an toàn khi chạy trên Expo Go.
  - **Tích hợp vào vòng đời ứng dụng:**
    - `App.js`: Nạp module `backgroundLocationManager` ngay khi khởi động.
    - `MapScreen.js`: Tự động kích hoạt khi vào màn hình bản đồ; khi bấm *"Mở Google Maps"* thì gửi ngay 1 tọa độ GPS tức thời trước khi chuyển ứng dụng; tự động hủy task khi giao hàng thành công (P.O.D) hoặc thoát màn hình.
    - `OrderDetailScreen.js`: Gửi GPS tức thời và kích hoạt task ngầm khi bấm mở Google Maps.

---

## 3. DANH SÁCH CÁC FILE ĐÃ TẠO MỚI & CHỈNH SỬA

### File Tạo Mới:
1. `avengers-coffee-system/apps/shipper-mobile/src/lib/branchHelper.js`: Module quản lý và chuẩn hoá tên, địa chỉ chi nhánh.
2. `avengers-coffee-system/apps/shipper-mobile/src/lib/navigationHelper.js`: Module điều hướng Google Maps độc quyền.
3. `avengers-coffee-system/apps/shipper-mobile/src/lib/backgroundLocationManager.js`: Module quản lý tác vụ GPS chạy ngầm.

### File Đã Chỉnh Sửa:
1. `avengers-coffee-system/apps/shipper-mobile/package.json` & `package-lock.json`: Thêm `expo-task-manager`.
2. `avengers-coffee-system/apps/shipper-mobile/app.json`: Bổ sung quyền iOS Background Modes, Android Foreground Service, Queries Schemes.
3. `avengers-coffee-system/apps/shipper-mobile/App.js`: Import `backgroundLocationManager` tại root.
4. `avengers-coffee-system/apps/shipper-mobile/src/screens/HomeScreen.js`: Bỏ mock ghép đơn, đồng bộ chi nhánh thật.
5. `avengers-coffee-system/apps/shipper-mobile/src/screens/MapScreen.js`: Bổ sung Google Maps, Background tracking, Marker description, đồng bộ chi nhánh thật.
6. `avengers-coffee-system/apps/shipper-mobile/src/screens/OrderDetailScreen.js`: Nút mở Google Maps, kích hoạt background GPS, đồng bộ chi nhánh thật.
7. `avengers-coffee-system/apps/shipper-mobile/src/screens/BatchOrderScreen.js`: Chuyển sang giao diện tính năng đang phát triển.
8. `avengers-coffee-system/apps/shipper-mobile/src/screens/BatchRouteScreen.js`: Đồng bộ `openGoogleMapsNavigation`.
9. `avengers-coffee-system/apps/shipper-mobile/src/screens/ProfileScreen.js` & `WalletScreen.js`: Cập nhật UI menu và hiển thị tên chi nhánh sạch đẹp.
10. `avengers-coffee-system/services/order-service/src/modules/shipper/shipper.service.ts`: Lấy chi nhánh thực tế từ `identity-service`, gán vào đơn hàng.
11. `avengers-coffee-system/services/order-service/src/modules/thanh-toan/thanh-toan.service.ts` & `delivery-tracking.service.ts`: Sửa thuật toán geocoding giữ nguyên địa chỉ đầy đủ kèm `proximity`.

---

## 4. TRẠNG THÁI HIỆN TẠI & HƯỚNG DẪN TIẾP TỤC CHO PHIÊN SAU
- **Hệ thống Docker Backend:** Đang chạy ổn định bình thường (`avengers_order_service`, `avengers_db`, `avengers_redis`,...).
- **App Shipper Mobile:** Cú pháp toàn bộ file JS đã được kiểm tra đạt chuẩn 100% (`node -c` mã thoát 0).
- **Khi mở phiên chat mới:** Bạn chỉ cần gửi nội dung tóm tắt hoặc yêu cầu tiếp theo, AI có thể đọc file `CONVERSATION_CONTEXT_SHIPPER_MAPS.md` này để nắm ngay toàn bộ ngữ cảnh mà không bị sót bất kỳ thông tin nào!
