# Quản lý đơn trong chat và sản phẩm bán chạy — 04/10/2026

## Chọn đơn theo số thứ tự và trả lời khi đơn đã huỷ — 05/10/2026

Hai lượt “cho tôi sửa đơn số 1 đi bạn” lúc 08:38 gặp Gemini HTTP 400 `unknown_incompatible_request` ngay vòng đầu, chưa thực hiện công cụ đơn. Log chưa xác định được trường cụ thể bị provider từ chối. Danh sách lịch sử trước đó cũng chưa được lưu trong namespace tham chiếu đơn; focus đơn từng bị loại khỏi bộ nhớ giới hạn.

Nay danh sách thực sự được trình bày lưu tối đa 20 mã đơn cùng `display_index`, tách khỏi số món và dòng giỏ. Gateway đóng băng tham chiếu đầu lượt và kiểm tra cả proposal đọc/sửa/huỷ/đặt lại theo đúng đơn đã chọn. Không đọc lại hoặc sắp xếp danh sách để đoán “số 1”; lần đọc lịch sử nội bộ chưa hiển thị không đổi số thứ tự. Một lịch sử mới được hiển thị sẽ thay danh sách cũ. Bộ nhớ/model projection giữ namespace đơn và focus cần thiết mà không đổi ngân sách token/context.

Câu chọn sửa/huỷ/đặt lại một số đơn rõ ràng, chưa có thay đổi cấu hình, đi qua gateway hiện có mà không gọi inference. Đọc lại đầy đủ đơn của đúng khách trước khi xét quy định: đơn đã huỷ trả lời rõ không thể sửa và khách có thể yêu cầu đặt lại; đơn COD mới tạo mở câu hỏi cần sửa gì. Huỷ/đặt lại vẫn chỉ xem trước và chờ xác nhận ở lượt sau. Câu hỏi, phủ định, điều kiện hoặc yêu cầu thay đổi cấu hình không bị chuyển thành lệnh chọn đơn đơn giản. Số ngoài danh sách hoặc không có danh sách yêu cầu khách chọn/gửi mã, không đoán từ lịch sử prose. Danh sách trước bản sửa chỉ được khôi phục từ receipt công cụ thành công khớp lời server đã hiển thị trong bộ nhớ đúng hội thoại; không khôi phục từ reply của hội thoại khác hay sau lần đọc lịch sử mới bị lỗi.

**352 kiểm thử liên quan qua**, gồm 24 trường hợp chọn số đơn mới và các luồng lịch sử, quản lý đơn, Gemini continuation, giỏ/checkout/discovery. Thêm 9 kiểm thử bộ nhớ qua; 1 test voucher cũ kỳ vọng 5 dòng trong khi code giữ đủ voucher hiển thị vẫn lỗi. Nạp `agent_memory.py` từ `HEAD` và chạy riêng test đó cũng lỗi y hệt (`100 != 5`); không đổi hành vi voucher. Toàn bộ launcher xoá credentials, chặn socket/DNS trước import, dùng provider/DB/Redis/Menu/Order giả; không gọi key thật hoặc sửa đơn thật để kiểm thử. Không đổi model/token/timeout và không tuyên bố đã khắc phục mọi HTTP 400 của provider.

## Sửa đọc trạng thái 3 đơn gần nhất — 05/10/2026

Log lượt 08:25 có `provider_failure_count=0`: chatbot đọc RAG, giỏ và trang liên hệ, không gọi công cụ đơn. `management_scope` chưa nhận câu “cho tôi xem trạng thái 3 đơn gần nhất tôi đặt đi”, nên công cụ lịch sử/trạng thái không được đưa vào bề mặt LLM. Mô tả công cụ còn ghi nhầm là chỉ đọc đơn đã hoàn thành.

Đã nhận các câu đọc đơn gần nhất/gần đây và lịch sử. Yêu cầu đơn giản, rõ số lượng đi thẳng qua gateway `get_order_history`, không cần inference. Các câu có sửa/huỷ/đặt lại, điều kiện phụ, nhiều tác vụ hoặc mã đơn cụ thể tiếp tục qua bộ xử lý hiện có. Truy vấn dùng tài khoản từ session, tham số `limit` 1–20 (mặc định 5), xếp mới nhất trước và trả trạng thái đơn/thanh toán. Bao gồm đơn đang xử lý, đã huỷ và hoàn thành. Server trình bày số đơn thực tìm được, thời gian Việt Nam, trạng thái và tổng tiền; không để LLM thay kết quả đọc bằng yêu cầu gọi hotline. Đọc chi tiết sau lịch sử vẫn được ưu tiên theo công cụ cuối. Khách chưa đăng nhập được yêu cầu đăng nhập; lỗi DB không được trình bày thành không có đơn. Giữ nguyên giỏ và preview sửa/huỷ đang chờ, receipt replay không đọc lại.

**328 kiểm thử liên quan qua**, gồm 27 trường hợp đọc lịch sử mới, quản lý đơn, giỏ/checkout, Gemini continuation và discovery. Launcher xoá credentials khỏi môi trường tiến trình test và chặn socket/DNS trước import; DB, Menu, Redis và provider đều giả. Không gửi chat bằng key thật, không đổi model/timeout/giới hạn token, không sửa hoặc huỷ đơn thật để test.

## Hành vi đã triển khai

Lỗi trả lời “Thông tin này cần tra cứu từ dịch vụ nghiệp vụ hiện tại” xảy ra vì công cụ huỷ/sửa đơn bị loại khỏi bề mặt công cụ của chatbot. Đã nối các công cụ mới vào Order Service, dùng tài khoản được xác thực từ session; mô hình không được tự chọn chủ đơn.

| Chức năng | Ràng buộc hiện tại |
| --- | --- |
| Huỷ đơn | Đơn của khách, trạng thái `MOI_TAO` hoặc `DA_XAC_NHAN`. Kiểm tra lại ở thời điểm xác nhận. |
| Sửa đơn | Chỉ đơn COD (`THANH_TOAN_KHI_NHAN_HANG`) ở trạng thái `MOI_TAO`. Sửa món, số lượng, size, topping, đá, ngọt, sữa, tùy chọn thêm, địa chỉ, khung giờ và ghi chú. |
| Đặt lại | Đọc đơn của khách, kiểm tra món/tùy chọn đang bán, lấy giá hiện tại và thêm nguyên tử vào giỏ đang có. Không xoá giỏ, tự tạo đơn hay thanh toán. |

Chat gửi phần xem trước rồi đợi khách xác nhận ở lượt sau. Phần xem trước có hạn 10 phút và gắn với phiên bản đơn, giá/tổng tiền; đặt lại còn gắn với phiên bản giỏ và mã thao tác chống thêm trùng. Nếu khách chỉ nói “sửa đơn”, chatbot hỏi phần cần sửa và nhớ mã đơn cho câu tiếp nối. Khi từ chối, chỉ bỏ yêu cầu xem trước.

Sửa món giữ nguyên các dòng và tùy chọn không được yêu cầu thay đổi. Giá do backend đọc lại từ Menu, không tin giá do client/mô hình gửi. Bánh không có bộ chọn size vẫn nhận nhãn mặc định `Nhỏ` theo hợp đồng giỏ hiện có. Tính lại giảm giá từ voucher đã được đơn sử dụng, không tiêu thụ thêm lượt voucher; phí giao được giữ theo đơn hiện tại, chưa tính lại tuyến giao khi đổi địa chỉ.

Huỷ và hoàn tiền dùng cùng transaction, khoá đơn trước khi kiểm tra trạng thái. Với đơn đã thanh toán bằng ví/VNPAY/QR/MOMO/ZALOPAY, giữ quy định hiện có là hoàn vào Ví Avengers. Gửi lại yêu cầu huỷ không hoàn tiền lần thứ hai. Trạng thái đang chuẩn bị/giao/hoàn thành không được khách huỷ.

## Cách tính bán chạy và món mới

- `sold_count`: tổng số lượng món (`SUM(so_luong)`), không phải số đơn.
- `order_count`: số đơn khác nhau có mua món.
- Chỉ tính đơn `HOAN_THANH` và `DA_THANH_TOAN`, số lượng dương; loại đơn huỷ, chưa thanh toán, chưa hoàn thành và thời điểm tương lai.
- Mốc lọc là thời gian tạo đơn `ngay_tao`. Ngày/tuần/tháng/năm theo lịch Việt Nam; tuần bắt đầu thứ Hai, cuối khoảng là mốc loại trừ. Khoảng hiện tại kết thúc ở thời điểm truy vấn.
- Chat dùng `filter_catalog(sort_by="sold_desc", period="day|week|month|year|all")`; `period_anchor="YYYY-MM-DD"` chọn một ngày thuộc khoảng lịch cần xem. Vẫn áp dụng nhóm món, giới hạn giá và số món khách yêu cầu.
- Nhãn web **Bán chạy tháng này** lấy top 10 món đang bán có số lượng bán dương trong tháng hiện tại, gồm các món đồng hạng ở ngưỡng. Không dùng `la_hot` thủ công làm bằng chứng bán chạy; không sửa cột đó trong DB.
- Món mới dùng `sort_by="new"`/`criteria="new"` theo `Menu.la_moi`. Bảng sản phẩm hiện chưa có ngày ra mắt, nên không tuyên bố đây là thứ tự ra mắt mới nhất.

## Kiểm tra đã thực hiện

Không gọi nhà cung cấp LLM, không dùng key AI của người dùng và không đổi model, giới hạn output hay timeout. Kiểm thử inference dùng provider giả lập; bài kiểm thử mới chặn socket mạng.

- Lần chạy cuối: **259 kiểm thử AI qua** trong 8 file: order management/sales, reported shopping journeys, checkout guarded contract, LLM tool orchestrator, compound discovery, guest login boundary, wallet top-up, provider wait budget.
- **51 kiểm thử Order Service qua**: order amendment, order management contract, reorder contract, customer wallet service, wallet top-up contract. **10 kiểm thử Menu Service qua**.
- Build Order Service, Menu Service và Web Customer thành công. `git diff --check` sạch. Đã cập nhật container AI/Menu/Order; web dùng source bind mount.
- Kiểm tra thật chỉ đọc Supabase và gọi endpoint `preview_only`/`reorder-preview`: đơn `924375ec-214d-4fd4-8ac5-a823ce4cb18b` trả tạm tính 293.000đ, giảm 10.000đ, phí giao 15.000đ, tổng 298.000đ; Latte giữ đủ hai topping, ít đá, thêm ngọt. So sánh snapshot cả đơn và chi tiết trước/sau: không thay đổi. Không huỷ/sửa/đặt lại/thanh toán đơn thật để test.
- Menu trả 118 sản phẩm; không có món gắn bán chạy nhưng số lượng bán bằng 0. Truy vấn ngày/tuần/tháng/năm chạy được; ngày kiểm tra chưa có đơn hoàn thành đủ điều kiện và trả chưa có dữ liệu.

Không tuyên bố toàn bộ suite cũ xanh: `test_guarded_tool_gateway.py` có 18 lỗi; đối chiếu bản `HEAD` trước thay đổi trong thư mục tạm cho đúng cùng 18 tên lỗi. Kiểm tra mở rộng `test_agent_redis_memory.py` có một lỗi cũ về kỳ vọng giới hạn 5 voucher, trong khi code hiện giữ mọi voucher được hiển thị; chạy bản trước thay đổi cũng lỗi y hệt. Không chỉnh hành vi voucher đang chạy để ép các test cũ qua.

## Câu chat để người dùng tự kiểm tra

1. `Cho tôi huỷ đơn 924375ec-214d-4fd4-8ac5-a823ce4cb18b, tôi hết tiền rồi` → xem trước → `xác nhận huỷ` hoặc `không huỷ`.
2. `Sửa đơn <mã đơn COD mới tạo>, bánh trung thu còn 1 cái, Latte giữ nguyên` → kiểm tra tổng và tùy chọn → `xác nhận sửa đơn`.
3. `Sửa đơn <mã đơn>` → `bánh còn 1 cái nhé` → xem trước đúng đơn → xác nhận hoặc bỏ yêu cầu.
4. `Đặt lại đơn <mã đơn>` → xem giá/tùy chọn → `xác nhận đặt lại` → kiểm tra giỏ và tiếp tục quy trình đặt đơn bình thường.
5. `Cho tôi xem 5 đồ uống bán chạy nhất tuần này`; `3 món bán chạy tháng 9 năm 2026`; `các món mới bên bạn có gì?`.

Các câu xác nhận huỷ/sửa sẽ thực hiện thật khi người dùng tự gửi, nếu đơn vẫn đủ điều kiện.

## Bổ sung sau phản hồi lúc 16:36

Lượt trước còn thiếu phần hiển thị lượt bán. Đã thêm component `ProductSalesSummary` dùng chung cho card menu/gợi ý, card sản phẩm, trang chi tiết và modal xem nhanh/chi tiết. Hiển thị **Đã bán X · Y đơn tháng này**, gồm cả số 0; khi API không có số liệu thì không tự biến thành 0. Trang chi tiết giải thích cơ sở là đơn hoàn thành và đã thanh toán. Endpoint chi tiết trả cùng số liệu và nhãn xếp hạng với endpoint danh sách. API thật của Americano Mơ trả **8 sản phẩm trong 7 đơn** trong tháng, hai endpoint khớp nhau.

Logs hai lượt chat lúc 16:36 cho thấy Gemini trả **HTTP 400 / incompatible_request** ngay vòng đầu, chưa thực hiện công cụ nào. Provider chỉ được phân loại `unknown_incompatible_request`, nên chưa đủ bằng chứng để khẳng định trường cụ thể nào bị từ chối. Không gọi thêm bằng key người dùng để dò lỗi và không đổi model/token/timeout.

Đã tách thao tác điều khiển có đủ dữ liệu khỏi suy luận: câu huỷ có một mã UUID đầy đủ như người dùng gửi được chuyển thẳng vào gateway đang có để đọc đơn của đúng khách và chuẩn bị phần xác nhận. Câu đồng ý/từ chối phần xem trước cũng đi qua gateway và kiểm tra trạng thái/phiên bản/quyền sở hữu như trước. Không huỷ ngay từ câu đầu. Câu hỏi, phủ định, điều kiện hoặc nhiều mã đơn không được tự suy đoán thành lệnh huỷ. Các yêu cầu cấu hình/sửa tự nhiên vẫn dùng LLM. Bề mặt công cụ còn được thu gọn theo huỷ/sửa/đặt lại, tránh gửi schema sửa đơn khi chỉ đang huỷ.

Sửa thêm xử lý mã UUID: lấy mã từ văn bản gốc trước khi chuẩn hoá tiếng Việt; không để bộ chuẩn hoá loại dấu gạch nối khỏi mã đơn. Xác nhận có kèm mã đúng được chấp nhận; mã khác vẫn bị chặn.

Kiểm tra bổ sung: **201 kiểm thử AI qua** (gồm wire contract Gemini offline), **11 kiểm thử Menu qua**, build Web/Menu và Docker AI/Menu/Web thành công. Kiểm tra render tĩnh xác minh số bán, số đơn, kỳ tháng, trường hợp 0/thiếu dữ liệu. Công cụ browser không khả dụng và quyền Computer Use chưa được cấp, nên không tuyên bố đã kiểm tra ảnh giao diện trên Chrome. Không gửi chat thật hay huỷ đơn thật để test.
