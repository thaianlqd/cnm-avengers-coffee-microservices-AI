# Kiểm chứng giao diện workspace — 13/10/2026

## Phạm vi đã sửa

- Khắc phục lỗi trắng do `consoleMainRef` chưa khai báo và fallback phân trang khách hàng tham chiếu biến chưa khai báo. Có error boundary gốc/theo tab, menu vẫn sử dụng được khi một tab lỗi.
- Tab login gửi workspace; cả API identity và frontend kiểm tra nhóm tài khoản trước token/session hoặc đổi mật khẩu lần đầu. Không cho manager đăng nhập ở tab đối tác. Nhân viên kiosk thuộc tab Nhân viên; đối tác là chủ nhượng quyền FRANCHISEE.
- Phiên mới tách theo tab bằng sessionStorage; đọc token, cập nhật hồ sơ và các module franchise dùng cùng nguồn phiên. URL workspace không phù hợp phiên cũ đưa về login.
- Sidebar trắng; màu sáng theo actor: admin graphite, manager teal, staff vàng olive, partner olive, accountant teal xám. Ghi rõ không dùng đỏ đô hoặc xanh tím chủ đạo tại UI_WORKSPACE_GUIDELINES.md.
- Menu nhóm căn trái, bỏ tiêu đề đậm/viết hoa; tìm kiếm mở trang từ danh sách đầy đủ, có Cmd/Ctrl K và focus/Esc. Kế toán và đối tác có nhóm menu theo nghiệp vụ; nhân viên kiosk giữ tab ngang POS/ca làm.
- Tìm kiếm và panel thông báo tải lười. Trang nặng admin/manager/accountant tách chunk với skeleton; popup thông báo gọn, có unread/read-all, phân trang, retry, giới hạn viewport. Không polling khi đóng; socket tiếp tục nhận thông báo mới. Hiệu ứng chuyển trang và reduced-motion.
- Khôi phục ảnh login theo năm actor, dùng asset cục bộ. Thẻ thành viên đồng đều footer, tab đang chọn phân biệt rõ, giảm màu và chữ đậm.
- Sửa grid cũ ép màn manager/staff về 260px, minmax cố định gây tràn POS/tin tức/hồ sơ, implicit gridColumn span 2 ở lịch nhân viên, bộ lọc shipper và wrapper bảng khách hàng/thu chi. Không cắt nội dung để che tràn.
- Biểu đồ đường/cột/donut dùng màu actor và có bảng dữ liệu. Một kỳ dữ liệu không được mô tả là đủ để kết luận xu hướng. Không tạo số liệu giả cho dữ liệu rỗng.

## Bằng chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend `npm test` | 11/11 pass: chart model/render, role contrast, session isolation/restore, các shell actor và login |
| Identity `npm test -- --runInBand workspace-policy` | 9/9 pass: role contrast, legacy mobile/customer không gửi workspace, workspace sai, không phát token/voucher khi sai nhóm, role admin có kiosk ID, nhân viên nhượng quyền |
| `npm run check:runtime` | Pass, không có identifier chưa khai báo |
| Production build web-admin/identity | Pass; bundle chính web-admin khoảng 493 kB trước gzip (bản trước tách tab khoảng 792 kB); đây là kích thước bundle, không phải latency đo thực |
| Chromium với API fixture | 61 mục điều hướng: admin 14, manager 17, staff 10, partner 13, accountant 3, nhân viên kiosk 4. Cả desktop 1440×1000 và 390×844: không runtime exception, không recovery, không tràn ngang shell/content |
| Login fixture | Manager ở tab đối tác bị từ chối và không lưu phiên; năm ảnh login đều tải được |
| Search/notification fixture | Mỗi actor mở search, no-match, đóng Esc; panel thông báo tải và đóng Esc được |
| ESLint đầy đủ | Còn 133 errors, 27 warnings trong code hiện có. So với lần trước 136 errors, 27 warnings: không tăng lỗi theo file/rule. Không tuyên bố full lint pass |

Kết quả máy đọc ở [artifacts/workspace-ui/report.json](artifacts/workspace-ui/report.json). Ảnh xem trước thẻ thành viên và popup đối tác nằm cùng thư mục. Fixture là dữ liệu tổng hợp, không chứa thông tin người dùng thật. Script tái chạy: `python3 tools/check-workspace-ui.py http://127.0.0.1:5174` (cần Python Playwright và Chromium).

Kiểm tra fixture xác nhận render, điều hướng, viewport và trường hợp login sai nhóm; không thay thế việc kiểm thử nghiệp vụ với tài khoản thật, dữ liệu dày, submit form, thanh toán hay các dialog con. Không gửi AI hoặc thay đổi dữ liệu backend trong kiểm thử UI. Không thực hiện deployment production.

## Chạy local và rollback

Web-admin ở 5174 bind mount source và Vite HMR. Tải lại trang nếu vẫn giữ module cũ. Chọn đúng nhóm login; phiên mới được giữ trong tab khi refresh.

Identity local dùng `node dist/main`, cần image mới. Đã build candidate từ source sau khi unit tests/build pass. Image gốc của container còn chạy đã mất layer trong kho Docker nên không thể tag/commit trực tiếp. Đã lưu `/app/dist` từ container cũ và dựng image rollback `avengers-identity:before-workspace-login-20261013` trên cùng dependencies (package không đổi). Không sao chép environment/credential vào artifact rollback.

Áp dụng riêng dịch vụ: `docker compose up -d --no-deps identity-service`. Rollback mã nếu cần: tag image rollback thành `cnm-avengers-coffee-microservices-ai-identity-service:latest`, rồi chạy lại cùng lệnh compose. Không có migration schema/job/session backend trong thay đổi này. Rollback này giữ dist cũ, không phải rollback các sửa đổi frontend; cần giữ/check out các file frontend theo bản mong muốn. Không chạy remove-orphans hay restart các service khác.

Kết quả rollout local: container identity mới đang chạy image `sha256:5b428d28ff70fe7c707276ab8066d00e6444a32e0edebc70d69b6a9d0ebba45b`. Đã kiểm tra handler compiled gọi workspace gate, module chấp nhận MANAGER/manager và từ chối MANAGER/partner với 403; route quản trị không token bên trong container trả 401. Image rollback nạp được module login cũ trong container riêng không mạng. Chưa thử đăng nhập tài khoản thật hoặc diễn tập chuyển toàn dịch vụ về rollback.

## Cập nhật màu menu và form/popup

Theo phản hồi mới, tăng độ rõ của điểm nhấn: Admin xanh lá `#28765b`; các actor khác giữ bảng màu riêng. Menu đang chọn có nền màu/chữ trắng, icon mục chưa chọn có ô màu nhạt. Tab con/nút lưu có màu rõ, toolbar và header bảng có sắc nhạt; các form nghiệp vụ dùng vùng nhập liệu màu nhạt và input trắng. Popup danh mục/thực đơn/khuyến mãi và form chi nhánh/hạng thành viên có header màu. Giữ màu lỗi/thao tác phá hủy riêng.

Đã kiểm tra thêm ba form/popup Admin ở desktop/mobile mà không submit: danh mục, hạng thành viên, chi nhánh. Kiểm tra màu nút lưu và kích thước icon đóng để phát hiện CSS cũ ép nền trắng hoặc co SVG. Báo cáo toàn actor và kiểm tra tập trung nằm ở `artifacts/workspace-ui/report.json`, `artifacts/workspace-ui/accent-focused-report.json`; ảnh popup/form mới nằm cùng thư mục. Lượt toàn actor: 61 tab, không runtime exception/recovery hay tràn ngang shell/content trên hai kích thước. Frontend 11 tests, runtime identifier check và production build pass. Đây là kiểm tra UI với API fixture, không phải kiểm tra submit nghiệp vụ/live backend.

## Sidebar tối và typography gọn theo phản hồi mới nhất

Đổi sidebar sang charcoal, font Inter (fallback hệ điều hành), menu/nút 12px, nội dung/form 13px, heading chính 20px và KPI 22px. Thay palette xanh lá bằng xanh dương/xanh biển/cam/rose/slate theo actor; bỏ launcher Shipper Mobile. Popup có thân trắng, header trung tính, input một viền focus và giới hạn chiều cao theo viewport; kiểm tra thêm form danh mục phụ trên mobile.

Dashboard quản lý/nhân viên có 5 biểu đồ: giá trị đơn theo ngày, trạng thái đơn, phương thức thanh toán, số lượng món được đặt, tình trạng tồn kho hiện tại. Nhóm tồn kho độc lập: còn hàng trên mức cảnh báo / sắp hết / hết hàng. Dashboard kế toán có 4 biểu đồ, bổ sung số kiosk theo khu vực. Biểu đồ đường dùng ResizeObserver để lấp chiều rộng thẻ mà không kéo giãn chữ SVG; bảng đối chiếu và dữ liệu rỗng vẫn giữ.

Qualification: lượt 61 tab với API fixture rỗng không runtime exception/recovery hoặc tràn ngang shell/content; lượt fixture có số liệu trên 3 dashboard admin/manager/accountant cũng pass. Oracle tồn kho fixture là 2 món trên mức cảnh báo, 1 sắp hết, 1 hết; phân nhóm đúng và không đếm trùng. Web-admin 11 tests, runtime check, build pass. Báo cáo và ảnh mới: `artifacts/workspace-ui/report.json`, `artifacts/workspace-ui/dashboard-preview-report.json`, `manager-dashboard.png`, `admin-category-popup.png`, `admin-subcategory-popup-mobile.png`. Tái chạy preview: `python3 tools/check-workspace-ui.py http://127.0.0.1:5174 manager,admin,accountant --rich`. Preview là số liệu tổng hợp, không phải dữ liệu sản xuất hoặc chứng minh nghiệp vụ live. Không submit form/ghi backend trong các lượt kiểm tra này.

## Ảnh login toàn màn hình và màu sáng rõ

Theo phản hồi mới nhất, ảnh role chuyển ra ngoài section story và phủ toàn viewport; form riêng tối đa 480px nằm bên phải, có bo góc/nền sáng. Mobile giữ ảnh nền và form một cột. Cả đổi mật khẩu lần đầu cũng dùng ảnh role hiện tại. Kiểm tra ảnh tải, chiều rộng ảnh bằng viewport, vị trí khung form bên phải cho 5 actor, không tràn ngang mobile.

Đối tác dùng xanh biển `#007cad`, kế toán xanh dương `#1764d8`, nhân viên cam `#c64b12`; bỏ accent hồng và xám của các actor này. Banner nhượng quyền xanh sáng, KPI trắng/chữ đậm màu đọc rõ. Badge công nợ thông thường xanh dương, vùng tổng công nợ và royalty chờ thu bỏ nền vàng rộng. Cảnh báo nghiệp vụ thật vẫn có màu/nhãn riêng. Tăng tương phản chữ mô tả/biểu đồ.

Lượt kiểm tra mới: 30 tab admin/partner/accountant ở desktop/mobile, 5 login và form Admin với API fixture: 0 failure/runtime exception/tràn ngang shell/content. Frontend 11 tests, runtime check và build pass. Báo cáo `artifacts/workspace-ui/login-full-color-report.json`, ảnh `login-admin.png`, `login-mobile.png`, `accountant-franchise.png`, `partner-dashboard.png`. Chưa submit nghiệp vụ hoặc login thật; số liệu preview là fixture. Lượt 61 tab ghi trước đó thuộc bản sidebar/font trước chỉnh palette này.

Đối chiếu thêm fixture đối tác có khoản nợ 7.500.000đ: badge số tiền đúng, nền/chữ xanh dương, biểu đồ công nợ có số liệu; 0 failure. Báo cáo `artifacts/workspace-ui/partner-debt-color-report.json`.


## Ảnh login Highlands — 13/10/2026

Thay ảnh stock bằng 5 ảnh Highlands Careers: góc quà tặng Admin, flagship Manager, đội ngũ Staff, rang xay Partner, Giáng sinh Accountant. Giữ composition full ảnh/khung form bên phải và kiểm tra role trước login. Ảnh tải cục bộ, nguồn trong `public/images/login/README.md`. Cả 5 ảnh tải thành công và phủ viewport 1440px; mobile không tràn ngang. Báo cáo/ảnh `artifacts/workspace-ui/highlands-login/`. Build, 11 test và runtime check pass; không đăng nhập hoặc ghi backend trong kiểm tra ảnh. Ảnh minh họa, không phải ảnh các chi nhánh trong database Avengers.

### Ảnh login bản gốc — 13/10/2026

Thay ảnh Admin và Accountant từ bản 1024 × 683 sang ảnh Highlands gốc 2048 × 1365; các vai trò còn lại đã dùng nguồn 2048 px. Chromium cô lập xác nhận naturalWidth=2048, nền rộng 1440 px/full viewport, CSS filter=none, không tràn ngang hay lỗi JS. Không đổi layout login toàn nền + thẻ phải. Bằng chứng: `artifacts/workspace-ui/highlands-sharp-login/`, nguồn trong `public/images/login/README.md`.
