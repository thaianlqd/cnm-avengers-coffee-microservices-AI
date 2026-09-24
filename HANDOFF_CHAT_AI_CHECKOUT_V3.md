# Handoff — AI Chat / Checkout Avengers Coffee (23/09/2026)

## Mục tiêu hiện tại

Tiếp tục cải thiện AI chat đặt hàng để:

- Không bỏ sót món khách chọn, đặc biệt khi khách chọn nhiều món theo số thứ tự.
- Không báo “đã thêm” nếu giỏ hàng/backend chưa ghi thành công.
- Kiểm tra tồn kho đúng theo chi nhánh trước khi tóm tắt và ngay trước khi tạo đơn.
- Với mang đi/dùng tại chỗ: hỏi khách chọn cửa hàng, không tự chốt cửa hàng gần nhất.
- Với địa chỉ hồ sơ: hỏi khách có đang ở địa chỉ đã lưu hay muốn nhập địa chỉ khác.
- Không âm thầm bỏ qua yêu cầu thời gian như “2 tiếng nữa tôi qua”.

## Những phần đã làm trước đó

Các thay đổi trước handoff này đã có trong workspace:

- Xác thực session/JWT và guest session.
- Lưu lựa chọn thanh toán, hình thức nhận, địa chỉ và fingerprint của bản tóm tắt.
- Chặn confirm khi giỏ/lựa chọn đã thay đổi.
- Parse chọn món theo số: “nước số 1 và bánh số 2”.
- Lưu `pending_products` để không checkout khi còn món chưa hoàn tất.
- Tách topping, size, lượng đá, độ ngọt, loại sữa khỏi ghi chú tự do.
- Đồng bộ AI cart với cart chính và xóa cart sau checkout thành công.
- Modal sửa đơn, lịch sử đơn và tìm kiếm chi nhánh trên frontend.

## Phần vừa sửa trong lượt này

### 1. Tồn kho dùng một lớp kiểm tra chung

File mới:

- `avengers-coffee-system/services/ai-service/src/common/inventory_validation.py`

`validate_cart_at_branch()` gom số lượng theo `product_id`, kiểm tra `so_luong_ton` và `dang_kinh_doanh`.

Thiếu bản ghi tồn kho được coi là `unverified`, không tự coi là còn hàng.

Đã gọi kiểm tra ở các điểm:

- Khi set chi nhánh.
- Khi thêm món vào giỏ sau khi đã chọn chi nhánh.
- Khi gọi `request_checkout`.
- Ngay trước `confirm_checkout`/tạo đơn.

### 2. Sửa lỗi “chat nói đã thêm nhưng đơn không có món”

Trong `agent_service.py`:

- Nhận diện câu dạng “mua thêm Bánh Trung Thu Matcha”.
- Tra tùy chọn thật.
- Nếu món không có tùy chọn: tra giá/tồn rồi ghi giỏ thật.
- Nếu có tùy chọn: lưu `pending_products` và hỏi khách chọn.
- Chỉ trả lời “đã thêm” khi `add_to_cart` trả `status=ok`.
- Nếu model tự nói đã thêm nhưng không có write thành công, câu trả lời bị thay bằng thông báo chưa ghi được giỏ.

### 3. Sửa flow chọn chi nhánh

Trong `branch_tools.py` và `agent_service.py`:

- Dùng tại chỗ/mang đi sẽ lưu danh sách `branch_candidates`.
- Bot phải chờ khách chọn cửa hàng số mấy/tên nào.
- `set_session_branch` bị chặn nếu model tự chọn khi khách chưa xác nhận.
- Khi khách chọn, backend mới kiểm tra tồn kho và set chi nhánh.

### 4. Sửa flow địa chỉ hồ sơ

- Khi cần tìm cửa hàng mà khách chưa đưa vị trí, hệ thống lấy địa chỉ mặc định làm gợi ý.
- Bot hỏi: “Bạn đang ở địa chỉ đã lưu này hay muốn dùng địa chỉ khác?”
- Chỉ sau khi khách xác nhận mới dùng địa chỉ để tìm cửa hàng.
- Địa chỉ nhập mới được geocode; nếu không xác định được thì yêu cầu khách nhập cụ thể hơn.

### 5. Không bỏ qua thời gian đến quán

Nếu khách nói “2 tiếng nữa tôi qua”, hệ thống nói rõ hiện chưa hỗ trợ đặt giờ/giữ bàn và hỏi khách muốn đặt ngay hay quay lại chốt gần giờ.

### 6. Sửa parser tiếng Việt không dấu

Phân biệt tốt hơn:

- “dùng tại chỗ” → lựa chọn TAI_CHO.
- “không dùng VNPay, tiền mặt” → chọn tiền mặt.
- Tránh nhầm “dùng” với “đừng” sau khi normalize bỏ dấu.

## File chính đã chạm

- `avengers-coffee-system/services/ai-service/src/agents/agent_service.py`
- `avengers-coffee-system/services/ai-service/src/common/cart_manager.py`
- `avengers-coffee-system/services/ai-service/src/common/inventory_validation.py`
- `avengers-coffee-system/services/ai-service/src/function_calling/tools/branch_tools.py`
- `avengers-coffee-system/services/ai-service/src/function_calling/tools/cart_tools.py`
- `avengers-coffee-system/services/ai-service/tests/test_chat_flow_safety.py`

Workspace cũng có các thay đổi frontend/backend khác của user từ trước. Không reset hoặc ghi đè chúng.

## Kiểm tra đã chạy

- Python compile: PASS.
- `git diff --check`: PASS.
- Docker build `ai-service`: PASS.
- Docker build `order-service`: PASS.
- Test container: **16 passed**.
- Container `ai-service` và `order-service`: đang chạy.
- `web-customer`: đã restart.

Lệnh đã dùng để kiểm tra lại:

```bash
docker compose build ai-service order-service
docker compose up -d --force-recreate ai-service order-service
docker compose restart web-customer
```

## Việc nên làm tiếp trong phiên chat mới

1. Hard refresh Chrome (`Cmd + Shift + R`) và mở cuộc chat mới.
2. Test lại transcript lỗi:
   - Chọn bánh + nước theo số.
   - Chọn option cho nước.
   - Chọn “dùng tại chỗ”.
   - Xác nhận địa chỉ hồ sơ.
   - Chọn cửa hàng cụ thể.
   - Thử thêm Bánh Trung Thu Matcha sau preview.
   - Kiểm tra bánh Matcha có thật trong cart/order hay không.
3. Test case hết hàng tại chi nhánh A rồi chuyển sang chi nhánh B.
4. Nếu muốn hỗ trợ đặt trước theo giờ, cần bổ sung field/backend contract cho `requested_pickup_time`; hiện tại chưa nên giả lập bằng prompt.
5. Sau khi test UI thực tế, xem log:

```bash
docker compose logs -f ai-service order-service web-customer
```

## Lưu ý nghiệp vụ

- Chat checkout hiện chỉ commit trực tiếp phương thức tiền mặt/COD.
- VNPay/ví điện tử cần flow payment riêng trước khi bật confirm qua chat.
- Tồn kho có thể thay đổi giữa preview và confirm nên luôn phải kiểm tra lại.
- “Gần nhất” chỉ là khoảng cách đường chim bay, không phải ETA đường đi.
- Không báo đơn thành công nếu response thiếu `order_id` hợp lệ.

## Cập nhật thêm (Phiên xử lý lỗi hiển thị & Hallucination của AI)

Trong phiên vừa qua, các lỗi sau đã được giải quyết:

### 1. Lỗi AI báo chưa thêm món vào giỏ hàng dù đã thêm
- **Nguyên nhân:** Khi phân tích món khách chọn theo số thứ tự, AI nhận diện tên bị thiếu số (ví dụ: `Lít Matcha Latte Tây Bắc`), nhưng tên gốc khi thêm vào giỏ là `1 Lít Matcha Latte Tây Bắc`. Việc so sánh chuỗi quá cứng nhắc khiến hàm `mark_pending_product_added` không gạch bỏ được món khỏi danh sách chờ.
- **Cách sửa (`cart_manager.py`):** Cập nhật hàm `mark_pending_product_added` để so khớp linh hoạt hơn (bỏ qua số ở đầu, hoặc kiểm tra chuỗi con).

### 2. Lỗi AI gợi ý mã giảm giá đã hết hạn
- **Nguyên nhân:** Tool `get_applicable_vouchers` chỉ lọc theo giá trị đơn tối thiểu và trạng thái `co_the_dung`, bỏ qua việc kiểm tra ngày hết hạn.
- **Cách sửa (`voucher_tools.py`):** Thêm logic so sánh thời gian hiện tại với trường `ngay_ket_thuc` hoặc `han_su_dung` trước khi đưa vào danh sách voucher khả dụng.

### 3. Lỗi Frontend hiển thị thiếu sản phẩm gợi ý
- **Nguyên nhân:** 
  - Giao diện chat (`ChatWidget.jsx`) chỉ dùng `.find()` để tìm kết quả gợi ý ĐẦU TIÊN (bị mất gợi ý thứ 2 nếu AI gọi cả đồ ăn và thức uống).
  - Giao diện bị giới hạn tải mặc định `.slice(0, 40)` sản phẩm, nên các món gợi ý nằm ngoài top 40 không hiển thị được thành thẻ (cards).
- **Cách sửa (`ChatWidget.jsx`):** 
  - Đổi `.find()` thành vòng lặp xử lý TẤT CẢ các tool calls gợi ý.
  - Xoá bỏ `.slice(0, 40)` khi fetch `/menu/san-pham` để cache toàn bộ dữ liệu khớp với kết quả AI.
  - Tăng số lượng thẻ sản phẩm tối đa hiển thị trong chat từ 6 lên 12.

### 4. Lỗi AI gọi 2 món nhưng chỉ thêm 1 món vào giỏ (Hallucination)
- **Nguyên nhân:** Khi khách gọi món không cung cấp đủ tuỳ chọn, AI tự biên tự diễn (hallucinate) ra tuỳ chọn và báo cáo ảo rằng "đã thêm vào giỏ" mà không thực sự gọi tool `add_to_cart` cho món thứ 2.
- **Cách sửa (`agent_service.py`):** Cập nhật gắt gao System Prompt (Quy tắc 18 và BƯỚC 1), CẤM tuyệt đối việc tự giả định các tuỳ chọn nếu khách chưa cung cấp. CẤM tuyệt đối việc gộp hoặc báo cáo đã thêm món nếu chưa thực thi thành công lệnh gọi `add_to_cart` cho TỪNG MÓN riêng biệt. Đã chạy lại các bài unit tests cho `ai-service` và toàn bộ đều **PASS**.
