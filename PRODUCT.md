# Avengers Coffee — Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Phạm vi tài liệu là toàn bộ hệ sinh thái Avengers Coffee. `web` là nền tảng cho các giao diện trình duyệt trong bản ghi gốc này; repository còn có các ứng dụng React Native / Expo cho khách hàng, quản trị và shipper trên iOS/Android. Khi làm việc trên ứng dụng native, đọc cấu hình và hướng dẫn nền tảng tương ứng; không suy ra rằng tất cả ứng dụng phải dùng cùng cách điều hướng hoặc cùng ngôn ngữ thiết kế theo hệ điều hành.

## Users

- **Ưu tiên chính, đã được người dùng xác nhận:** khách hàng đặt cà phê. Công việc trọng tâm là tìm món, chọn món, thao tác giỏ hàng, thanh toán và theo dõi đơn.
- **Các nhóm được phục vụ trong hệ sinh thái hiện có:** nhân viên cửa hàng, quản lý và quản trị viên vận hành đơn hàng, POS, kho và dashboard; shipper nhận và giao đơn; các vai trò nhượng quyền quản lý kiosk; người dùng nền tảng dữ liệu xem báo cáo và phân tích kinh doanh với AI.
- Khi có xung đột về ưu tiên thiết kế giữa các nhóm, lấy hành trình đặt hàng của khách làm ưu tiên chung; vẫn bảo toàn quyền hạn và nghiệp vụ của từng vai trò.

## Product Purpose

Đây là dự án môn học / đồ án công nghệ, được người dùng xác nhận ngày 23/10/2026: xây dựng hệ thống F&B đa dịch vụ (microservices) kết hợp AI cho chuỗi Avengers Coffee.

Hệ thống kết nối đặt hàng online, vận hành cửa hàng, giao hàng, nhượng quyền kiosk và phân tích dữ liệu. Thành công về sản phẩm là khách hoàn thành việc đặt món dễ dàng, đồng thời các bước xử lý liên quan vẫn hoạt động xuyên suốt và có thể trình diễn, kiểm chứng trong đồ án. Chưa có chỉ tiêu chuyển đổi hoặc thời gian hoàn thành tác vụ được xác nhận.

## Positioning

Cơ chế thể hiện trong repository là kết nối nghiệp vụ thương mại F&B với chatbot đặt hàng AI và nền tảng phân tích kinh doanh trên cùng hệ sinh thái đa dịch vụ. AI hỗ trợ hiểu yêu cầu và khai thác dữ liệu, còn các thao tác thương mại sử dụng nghiệp vụ và dữ liệu do server quản lý.

Đây là mô tả cơ chế hiện có, không phải tuyên bố về ưu thế thị trường, số khách hàng thực tế hay mức độ sẵn sàng vận hành thương mại.

## Operating Context

- Khách truy cập qua web hoặc ứng dụng di động; đội vận hành, shipper và các vai trò nhượng quyền dùng giao diện theo vai trò của mình.
- Luồng khách hàng chủ đạo: thực đơn / tư vấn món → giỏ hàng → đặt hàng và thanh toán → theo dõi trạng thái đơn và giao hàng.
- Các luồng liên quan gồm xử lý đơn tại cửa hàng, POS, quản lý kho, giao hàng và quản lý nhượng quyền kiosk. Nền tảng dữ liệu cung cấp dashboard và trợ lý phân tích kinh doanh.
- Các ứng dụng web dùng React / Vite; ứng dụng di động dùng React Native / Expo. Backend gồm API gateway, các dịch vụ NestJS và dịch vụ AI / phân tích bằng Python. Giữ các ranh giới ứng dụng và tích hợp hiện có khi sửa giao diện.
- Môi trường chạy được mô tả trong `SETUP.md`, `docker-compose.yml`, `docker-compose.data.yml` và các cấu hình ứng dụng. Không coi nội dung demo, seed hoặc tài liệu cũ là bằng chứng đã triển khai thương mại.

## Capabilities and Constraints

### Các luồng bắt buộc giữ nguyên

Người dùng đã xác nhận cần bảo toàn đặt hàng online, giỏ hàng, thanh toán, quản lý nhượng quyền kiosk và dashboard quản trị. Thay đổi giao diện phải giữ chức năng, dữ liệu, trạng thái và phân quyền của các luồng này; không loại bỏ bước nghiệp vụ chỉ để đơn giản hóa bố cục.

### Sự thật nghiệp vụ từ repository

- Hệ thống có tích hợp thanh toán và các trạng thái đơn / giao hàng. Hiển thị lựa chọn, số tiền và kết quả theo dữ liệu server cùng cấu hình thực tế; không suy ra một phương thức luôn khả dụng chỉ vì mã tích hợp tồn tại.
- Chatbot đặt hàng dùng kiến trúc Hybrid: LLM hiểu ý; giá, tồn kho, giỏ hàng, voucher, thanh toán và quyền ghi do server quyết định. Giao diện không tự dựng kết quả giao dịch hoặc xác nhận thành công thay server.
- Nền tảng phân tích phân biệt dữ liệu đồng bộ theo đợt, dữ liệu dashboard và nguồn có phạm vi giới hạn. Nhãn số liệu phải phản ánh nguồn, phạm vi và độ tươi thực tế; không gọi mọi số liệu là thời gian thực hoặc toàn hệ thống.
- Bảo toàn việc phân tách tài khoản, quyền truy cập và hành động theo vai trò trong giao diện vận hành và phân tích.

### Ngôn ngữ và khả năng thao tác

- **Cam kết đã xác nhận:** hỗ trợ song ngữ Việt–Anh. Web khách hàng đã có `i18next` và tài nguyên `vi` / `en`; chưa kiểm chứng độ bao phủ hai ngôn ngữ trên toàn bộ hệ sinh thái.
- Nhãn và thông báo phải dễ hiểu, tiếng Việt có dấu đầy đủ; chuyển mã trạng thái nội bộ thành nhãn cho người dùng. Bảo toàn thuật ngữ và ý nghĩa khi dịch.
- Giao diện hiện đại, tinh gọn, dễ thao tác là yêu cầu của người dùng. Đơn giản hóa cách sử dụng mà vẫn giữ đủ hành động và phản hồi cần cho nghiệp vụ.

## Brand Commitments

- **Ngoại lệ Web Admin đã được người dùng xác nhận ngày 23/10/2026:** dùng xanh đen/xanh da trời, sidebar xanh đen, chữ rõ hơn và component shadcn/ui theo mẫu Zenith. Thay đổi này áp dụng cho không gian quản trị; giao diện đặt món của khách vẫn giữ đỏ #b22830 và kem ấm.

- Tên thương hiệu: **Avengers Coffee**.
- **Ràng buộc trực tiếp từ người dùng:** tone đỏ chủ đạo `#b22830`, kết hợp màu kem ấm cao cấp. Giữ nhận diện này khi thiết kế; chưa xác nhận một mã màu kem cụ thể.
- **Icon:** không dùng icon do AI tạo. Trên web, dùng icon chuẩn từ `react-icons` theo yêu cầu người dùng. Các ứng dụng native hiện dùng `@expo/vector-icons`; tiếp tục dùng icon thư viện phù hợp nền tảng, không ép thư viện DOM vào React Native.
- Giữ các logo và tài nguyên thương hiệu hiện có phù hợp phạm vi thay đổi. Ràng buộc màu và icon ở đây là cam kết người dùng đã xác nhận; tài liệu này không định nghĩa thêm typography, token hoặc hệ thống component.

## Evidence on Hand

- `docs/SYSTEM_OVERVIEW.md`: tổng quan nghiệp vụ, luồng dữ liệu, chatbot Hybrid và phân tích AI. Đây là tài liệu repository; các kết quả kiểm thử được ghi trong đó không phải kết quả chạy mới của lần init này.
- `avengers-coffee-system/apps/web-customer/`: giao diện khách hàng hiện có; `src/i18n.js` và `src/locales/{vi,en}.json` cung cấp hạ tầng song ngữ.
- `avengers-coffee-system/apps/web-admin/`, `avengers-coffee-system/apps/web-shipper/` và `avengers-coffee-system/apps/{customer,admin,shipper}-mobile/`: bằng chứng triển khai các giao diện theo vai trò.
- `data-platform/web-ui/`: dashboard, giao diện phân tích và trợ lý AI.
- `avengers-coffee-system/apps/web-customer/public/images/brand/`: logo, tài nguyên hình ảnh và `README.md` ghi nguồn / cách tạo. Ảnh `coffee-space-v1.jpg` là hình ý tưởng không gian do AI tạo, không phải ảnh chứng minh một chi nhánh đang hoạt động.
- `avengers-coffee-system/apps/customer-mobile/assets/branding/`: logo và splash cho ứng dụng khách hàng.
- `avengers-coffee-system/apps/customer-mobile/assets/campaigns/README.md`: ghi nguồn ảnh tham khảo mùa lễ hội; không dùng chữ hoặc thương hiệu trong ảnh để tạo chương trình khuyến mãi hay tuyên bố mới.
- Chưa có bằng chứng được xác nhận trong lần init này về khách hàng thương mại, doanh thu thực tế, lời chứng thực, độ phủ chi nhánh hoặc cam kết hiệu năng. Không tự tạo những nội dung đó khi thiết kế.

## Product Principles

1. **Ưu tiên việc đặt món của khách:** giúp khách hiểu món, giỏ hàng, số tiền và bước tiếp theo để hoàn tất đặt hàng.
2. **Giữ nghiệp vụ xuyên suốt:** cải thiện trải nghiệm mà vẫn giữ đủ các luồng khách hàng, cửa hàng, shipper, nhượng quyền và quản trị hiện có.
3. **Hiển thị theo sự thật hệ thống:** giao dịch, tồn kho, trạng thái và số liệu phải có căn cứ từ server / nguồn dữ liệu; phân biệt kết quả thật với nội dung demo.
4. **Dễ hiểu ở cả hai ngôn ngữ:** dùng nhãn rõ nghĩa, dịch nhất quán và hiển thị trạng thái / lỗi đủ để người dùng biết cách tiếp tục.
5. **Nhận diện nhất quán, thao tác phù hợp vai trò:** giữ cam kết thương hiệu và icon chuẩn, đồng thời tôn trọng nền tảng và công việc của từng nhóm người dùng.

## Open Decisions

- Chưa xác nhận chuẩn tiếp cận cụ thể hoặc nhu cầu hỗ trợ riêng của nhóm người dùng; không tuyên bố đạt chứng nhận khi chưa đánh giá.
- Chưa xác nhận mã màu kem cụ thể hoặc một hệ thống thiết kế dùng chung cho toàn bộ ứng dụng.
- Chưa xác nhận các KPI trải nghiệm, quy mô vận hành thương mại hoặc phạm vi triển khai production. Bối cảnh đã chốt là đồ án / demo.
