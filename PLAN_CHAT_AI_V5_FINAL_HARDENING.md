# Chat AI V5 Final Hardening Plan

## Mục tiêu và nguyên tắc bất biến

- Giữ Order Service là nguồn dữ liệu giỏ hàng duy nhất; mọi thay đổi từ chat dùng API dòng giỏ theo `line_id`.
- Không suy đoán món, biến thể, chi nhánh, voucher hoặc địa chỉ khi dữ liệu chưa đủ rõ.
- Không hardcode dữ liệu nghiệp vụ mẫu. Chỉ dùng dữ liệu trả về từ Menu, Inventory, Identity và Order Service.
- Không chạy migration hoặc thao tác destructive trên database ngoài môi trường E2E cô lập có opt in rõ ràng.
- Migration chỉ được thêm mới; không sửa migration đã có lịch sử.

## Root causes AS-IS

1. Resolver dòng giỏ chỉ trả một dòng hoặc câu hỏi, không lưu loại thao tác, giá trị yêu cầu và tập `line_id` ứng viên; câu trả lời ordinal vì thế không thể tiếp tục chính xác thao tác ban đầu.
2. Snapshot gợi ý chỉ giữ danh sách phẳng hoặc danh sách theo nhóm, thiếu metadata global/group trên từng sản phẩm; quy tắc ưu tiên global rồi local chưa được biểu diễn trực tiếp.
3. Mọi nhóm option có nhiều giá trị đang bị coi là bắt buộc và luồng sửa option chưa có hợp đồng PATCH riêng theo `line_id`.
4. Pending action đang được xử lý như intent chính ở một số nhánh; intent mới có độ ưu tiên cao có thể bị context cũ chặn.
5. Lựa chọn fulfillment và payment được phát hiện theo các nhánh rời, nên một câu chứa cả hai có thể chỉ ghi một phần hoặc hỏi lặp.
6. Chuẩn hóa địa chỉ chưa phân biệt đủ địa chỉ giao tận nơi với khu vực rộng dùng để tìm quán; thuật toán cửa hàng có thể short circuit sau exact match và không bổ sung lân cận.
7. Voucher chat/web chưa dùng chung đầy đủ một nguồn quote/revalidation ở mọi mutation và trước checkout cuối.
8. Durable voucher claim outbox mới được schedule trong nhánh ví; retry chưa phân loại lỗi vĩnh viễn, chưa có giới hạn lần thử và metadata lỗi đầy đủ.
9. Luồng top up cần khóa bản ghi topup và ví trong cùng transaction để callback đồng thời không cộng tiền hai lần; refund cần được kiểm tra cùng tiêu chuẩn idempotency.
10. E2E có thể tự đặt DB mặc định rồi gọi schema sync; chưa bắt buộc `NODE_ENV=test`, opt in và schema cô lập trước mọi thao tác ghi.
11. Một số secret có fallback cố định trong runtime; production chưa fail fast thống nhất.
12. Web chat còn gắn card theo keyword/cache, nên có thể hiện dữ liệu không liên quan đến payload có cấu trúc của lượt hiện tại.

## Kế hoạch triển khai

### 1. Cart resolver và pending operation có kiểu

- Tạo resolver trả `resolved`, `ambiguous` hoặc `not_found`, ưu tiên tên đầy đủ chính xác rồi cụm token có nghĩa duy nhất.
- Khi có nhiều dòng cùng family/biến thể, chỉ đưa đúng ứng viên khớp vào câu hỏi.
- Lưu pending action gồm `operation`, `requested_value`, `candidate_line_ids`, `display_snapshot` và dữ liệu patch đã chuẩn hóa.
- Khi khách trả ordinal, ánh xạ vào snapshot, gọi đúng PATCH/DELETE theo `line_id`, xóa pending và trả kết quả đúng với thao tác ban đầu.
- Áp dụng cùng cơ chế cho đổi số lượng, xóa, sửa option và focus dòng giỏ.

### 2. Snapshot menu và ordinal hai tầng

- Chuẩn hóa mỗi snapshot thành `product_id`, `product_name`, `global_display_index`, `group`, `group_display_index`.
- Với ordinal có qualifier nhóm: thử global index trước nếu loại món khớp; nếu không, dùng index cục bộ trong nhóm.
- Với ordinal không qualifier: chỉ dùng global index. Không đọc lại tên món từ prose của assistant khi snapshot có cấu trúc tồn tại.

### 3. Option và chỉnh dòng

- Phân loại nhóm option thành bắt buộc, tùy chọn và fixed từ metadata Menu; chỉ tự chọn khi nhóm fixed có đúng một giá trị.
- Nhóm nhiều giá trị bắt buộc phải hỏi; nhóm tùy chọn có thể bỏ qua rõ ràng và không tự gán option đầu.
- Sửa option bằng PATCH đúng dòng hiện có; không remove rồi add lại.
- Decode entity/whitespace trước khi so khớp và lưu option.

### 4. Intent, checkout và location

- Pending chỉ là context; các intent cancel, cart mutation, đổi fulfillment/payment, chọn branch và checkout được ưu tiên trước.
- Parse fulfillment và payment thành một structured patch để ghi đồng thời và giữ qua các lượt location.
- Chỉ hỏi trường còn thiếu; không gửi lại card lựa chọn đã chốt.
- Tách validation địa chỉ giao chi tiết khỏi khu vực rộng cho pickup/dine in.
- Chuẩn hóa component địa chỉ bằng so sánh equality tổng quát; không dùng substring. Khi sửa địa chỉ, thay thế candidate/context cũ.
- Tìm branch theo exact trước, sau đó bổ sung nearby, rerank, loại trùng, tối đa 5 và kiểm tra availability của toàn giỏ.

### 5. Voucher và quote

- Dùng Order Service làm business source cho apply/remove/applicable/quote ở cả Web và AI.
- Applicable phải đánh giá toàn bộ rule, usage/pending claim và dữ liệu giỏ hiện tại.
- Mọi mutation giỏ làm mất hiệu lực quote cũ và revalidate voucher; final quote revalidate lần cuối trước tạo đơn.
- Khi thiếu bảng outbox/migration, trả lỗi readiness 503 có mã ổn định, không lộ SQL thô.

### 6. Durable claim cho mọi phương thức thanh toán

- Schedule một outbox record theo `order_id` tại đúng thời điểm voucher được tiêu thụ cho COD, ví, VNPAY, QR và các đường checkout khách hàng hiện có.
- Giữ idempotency một order/một voucher; worker chạy nền không chặn startup.
- Thêm migration additive cho `last_error`, `error_code`, `updated_at`, `dead_at`, giới hạn attempt và index retry.
- Retry network/429/5xx theo exponential backoff có trần; 4xx nghiệp vụ thành `DEAD`; dừng sau max attempts.

### 7. Wallet/top up/refund và secret

- Bọc callback top up trong transaction, pessimistic lock topup record và wallet, kiểm tra trạng thái trước atomic credit.
- Củng cố idempotency refund theo reference duy nhất và transaction lock.
- Production bắt buộc secret payment/internal; default chỉ được phép rõ ràng trong development/test.

### 8. E2E safety và CI

- Tạo helper dùng chung kiểm tra `NODE_ENV=test`, `E2E_DB_SAFE=1`, host local/CI cho phép và tên schema cô lập trước import AppModule/synchronize.
- Mỗi suite dùng schema riêng; workflow CI truyền explicit opt in.
- Thêm test fail fast chứng minh helper từ chối cấu hình production/canonical.

### 9. Web UX và kiểm thử hồi quy

- Render product/store/voucher/order cards chỉ khi API lượt hiện tại trả payload có cấu trúc tương ứng.
- Thêm test deterministic cho resolver giỏ, ordinal global/local, option required/optional/fixed, pending override, structured checkout patch, location equality, branch ranking, voucher revalidation/outbox retry, top up concurrency và E2E safety.
- Chạy unit/integration/build/lint phù hợp ở AI, Order, Identity và Web; ghi rõ mọi lỗi nền còn lại.

## Thứ tự thực hiện

1. AI resolver/snapshot/options/intent/location.
2. Voucher quote và Order outbox đa phương thức.
3. Wallet concurrency, readiness và secret validation.
4. E2E safety/CI.
5. Web payload rendering.
6. Test, build và rà migration/manual smoke script.
