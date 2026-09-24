# Bằng chứng từ code — Chat AI Avengers Coffee

Đọc mã nguồn ngày 23/09/2026. Tài liệu này hỗ trợ [PLAN V2](../../PLAN_CHAT_AI_IMPROVEMENT.md); không thay thế test runtime. Số dòng là tại thời điểm rà soát, có thể thay đổi sau khi triển khai. P0 là ưu tiên đối với tính đúng của nghiệp vụ đặt hàng.

## 1. Các luồng thực tế đang tồn tại

```text
ChatWidget.callAgentAPI
  → POST /ai/agent/chat {session_id, message, history}
  → main.agent_chat → agent_service.run_agent
  → groq_agent_chat → TOOL_EXECUTORS (22 tools)
  → đọc SQL / ghi cart AI / gọi Order service

Tóm tắt
  → execute_request_checkout → checkout_prefs RAM + order_summary
  → UI pendingOrder

Xác nhận bằng câu chat
  → keyword intercept hoặc tool confirm_checkout
  → finalize_checkout → POST order-service/orders

Xác nhận bằng nút
  → ChatWidget.confirmOrder
  → POST /ai/cart/checkout {delivery_type: 'DELIVERY', ...}
  → finalize_checkout → POST order-service/orders

Fallback UI
  → /ai/chat/order-intent hoặc /ai/chat
  → có thể tạo pendingOrder từ một cơ chế hiểu câu khác

Checkout web thông thường
  → khoiTaoThanhToan
  → có xử lý voucher, giá kiosk, tìm cơ sở, nhánh payment

Tạo đơn trực tiếp qua AI
  → taoDonHangTrucTiep
  → lưu order/details/payment theo payload
```

Hai đường xác nhận cuối cùng đã dùng chung `finalize_checkout`, nhưng dữ liệu đầu vào, validation và đường checkout web vẫn khác nhau. Không thể chỉ sửa một prompt rồi mặc nhiên coi các đường tương đương.

## 2. Findings và việc cần làm

### F01 — P0: “đồng ý” có thể xác nhận nhầm nghiệp vụ

Nguồn: [agent_service.py](../../avengers-coffee-system/services/ai-service/src/agents/agent_service.py), `run_agent`, khoảng dòng 169–195.

Nhánh đầu kiểm tra message trước chứa “xác nhận” hoặc “đồng ý” rồi gọi `execute_confirm_checkout`. Nhánh `elif "xác nhận hủy"` nằm sau, trong khi cụm này đã thỏa nhánh đầu. Câu “ok nhưng đổi…” cũng khớp điều kiện bắt đầu bằng keyword. Đây là đường điều khiển có thể định tuyến sai từ code; chưa có transcript thực nghiệm trong đợt rà này.

Cần `pending_action` có loại/id/đối tượng/version; xử lý phủ định và thay đổi trước confirmation. Thêm ca phân biệt đồng ý địa chỉ, sửa, hủy và chốt đơn.

### F02 — P0: tool tồn kho không kiểm tra tồn kho thực

Nguồn: [product_tools.py](../../avengers-coffee-system/services/ai-service/src/function_calling/tools/product_tools.py), `execute_check_price_and_stock`, khoảng dòng 118–215.

Hàm đọc menu và phụ thu size rồi đặt `in_stock=True` cho mọi kết quả. `branch_id` không được dùng để tra inventory/giá kiosk trong hàm này; chuỗi “Chưa chọn” vượt điều kiện kiểm tra không rỗng. Vì vậy tên tool và dữ liệu trả về làm agent có thể tin một kiểm tra tồn chưa xảy ra.

Cần kiểm tra availability theo outlet/product/quantity và biểu diễn `UNKNOWN` khi chưa chọn cơ sở.

### F03 — P0: giá và options chưa được chuẩn hóa ở biên nghiệp vụ

Nguồn: `product_tools.execute_check_price_and_stock`, [cart_tools.py](../../avengers-coffee-system/services/ai-service/src/function_calling/tools/cart_tools.py), `execute_add_to_cart`; [thanh-toan.service.ts](../../avengers-coffee-system/services/order-service/src/modules/thanh-toan/thanh-toan.service.ts), `taoDonHangTrucTiep` khoảng dòng 1963.

Tool thêm giỏ nhận `unit_price` do model truyền. Đường tạo đơn trực tiếp tính tiền từ `gia_ban` payload. Trong tool tìm giá, phụ thu size được tra trên sản phẩm đầu rồi dùng cho các kết quả. Các tùy chọn khác thường chỉ thành note. Cần server lấy giá, options và phụ thu đúng từng món; model chỉ gửi ID/lựa chọn.

### F04 — P0: giỏ có hai nguồn ghi và đồng bộ thiếu

Nguồn: `cart_tools.execute_add_to_cart`, `execute_remove_from_cart`; [cart.service.ts](../../avengers-coffee-system/services/order-service/src/modules/cart/cart.service.ts).

Thêm món cập nhật AI cart trước; lỗi sync Order service chỉ log, kết quả vẫn `ok`. Nhánh sync xóa hiện là `pass`, không xóa dòng giỏ chính. Đây là nguyên nhân trực tiếp có thể khiến bot nói xóa/thêm thành công nhưng trang giỏ khác.

Cần Order cart chuẩn, `line_id`, version và response từ write thành công. Đổi món cần batch validation trước khi xóa món cũ.

### F05 — P1: nhận diện dòng món không đồng nhất

Nguồn: [cart_manager.py](../../avengers-coffee-system/services/ai-service/src/common/cart_manager.py), `add_item`; Order `cart.service.ts`, `themVaoGiỏ`.

AI gộp theo product + size và có thể ghi đè note. Cart chính còn xét topping, đá, đường, sữa, custom attributes. Hai ly cùng size khác độ ngọt có thể bị AI gộp. Chốt một khóa dòng theo toàn bộ cấu hình, và thao tác theo line ID.

### F06 — P0: địa chỉ mới không theo đến lúc tạo đơn

Nguồn: [checkout_service.py](../../avengers-coffee-system/services/ai-service/src/common/checkout_service.py), `finalize_checkout`.

Hàm nhận session/payment/delivery, không nhận địa chỉ đã chọn của draft. Nhánh giao hàng truy vấn địa chỉ hồ sơ `ORDER BY mac_dinh DESC LIMIT 1`; nếu không lấy được còn dùng chuỗi mô tả mặc định. Plan phải lưu địa chỉ snapshot và chặn giao nếu địa chỉ chưa đủ, không tự thay bằng hồ sơ.

### F07 — P0: UI xác nhận làm mất hình thức nhận và có thể báo thành công giả

Nguồn: [ChatWidget.jsx](../../avengers-coffee-system/apps/web-customer/src/components/ChatWidget.jsx), xử lý pendingOrder khoảng 638–653, `confirmOrder` khoảng 888–907; [main.py](../../avengers-coffee-system/services/ai-service/main.py), `/ai/cart/checkout`.

PendingOrder không giữ `delivery_type` từ summary; nút xác nhận gửi cứng `DELIVERY`. Sau `await post`, UI tự hiện thành công mà không đọc body status/order_id. Endpoint có thể trả dictionary lỗi với HTTP 200. Sửa response discriminated union, action ID và điều kiện thành công; loại hardcode.

### F08 — P0: tên phương thức thanh toán và trạng thái có thể mâu thuẫn

Nguồn: Order `thanh-toan.service.ts`, `taoDonHangTrucTiep`.

Hàm lấy `phuong_thuc_thanh_toan` từ payload nhưng gán `trang_thai_thanh_toan='CHO_THANH_TOAN_KHI_NHAN_HANG'` và giao dịch `CHO_THU_TIEN`. Đường này không xử lý VNPay giống `khoiTaoThanhToan`. Vì vậy chọn VNPay qua chat chưa đủ để chứng minh thanh toán online được khởi tạo đúng.

Giới hạn adapter AI đợt đầu ở COD khi test; các phương thức khác chỉ bật khi có nhánh tạo payment/action tương ứng. Không đổi lựa chọn khách sang COD ngầm.

### F09 — P0: check lock chưa phải idempotency xuyên request/service

Nguồn: `checkout_service.finalize_checkout`; `cart_manager.get_cart`, `set_is_checking_out`; Order `taoDonHangTrucTiep`.

Đọc cờ và ghi cờ là hai thao tác khác nhau; API `/orders` không nhận operation key trong đường được đọc. Order được tạo bằng UUID mới mỗi lần. Timeout mở khóa lại mà không tra xem Order service đã tạo chưa. `last_order_id` sau clear chỉ giảm một số lần lặp, không giải quyết crash/concurrency.

Cần unique operation/action key tại Order service, payload hash, atomic version check và lookup sau timeout. Local lock không bảo vệ nhiều worker.

### F10 — P1: state được persist thiếu, TTL chưa xuyên DB

Nguồn: `cart_manager._sync_to_db`, `_load_from_db`, `set_checkout_prefs`, `clear_cart`.

`checkout_prefs` dùng `sync_db=False` và không nằm trong các trường DB load/save. `clear_cart` không loại preferences. DB load không lọc hết hạn và gán timestamp mới ở RAM. Có nguy cơ restart mất lựa chọn, hoặc lựa chọn cũ tiếp tục tồn tại sau đơn trước. Cần version/schema migration, expiry thật, reset draft rõ ràng.

### F11 — P1: bot thực nhận ít lịch sử hơn giới hạn backend

Nguồn: `ChatWidget.callAgentAPI` dòng 589; `agent_service._build_messages` dòng 107.

Frontend gửi 8 messages, backend cho tối đa 20 nhưng không thể phục hồi 12 messages chưa được gửi. Backend cắt nội dung theo 1.500 ký tự/message. State context chỉ có giỏ/chi nhánh. Cần lịch sử server-side + structured state + token budget, không chỉ tăng số message.

### F12 — P1: refresh cart dùng sai field log

Nguồn: `ChatWidget.jsx` dòng 630 dùng `t.name`; `groq_service.py` dòng 525 sinh `{"tool": tool_name, ...}`. Các nhánh UI khác lại dùng `t.tool`.

Điều kiện refresh-cart ở nhánh này không khớp payload agent. Đích là `ui_events`/cart version chuẩn, không phụ thuộc debug log.

### F13 — P0: UUID hợp lệ không chứng minh đúng người dùng

Nguồn: [helpers.py](../../avengers-coffee-system/services/ai-service/src/function_calling/helpers.py), `_require_valid_session`, `_get_service_jwt`; `main.py` agent/cart endpoints; [gateway main.ts](../../avengers-coffee-system/api-gateway/gateway-root/src/main.ts), proxy `/ai`.

Helper chỉ parse UUID. Endpoint agent nhận session từ body; trong các handler đã đọc không thấy dependency auth ràng buộc actor với session. Tools có điều kiện SQL theo session nhưng session cần được xác minh trước. Token gọi service là internal credential; không tự chứng minh khách sở hữu user ID gửi lên.

Cần xác thực và authorization trên tài nguyên ở server, gồm read và write. Đây là gap tại lớp code đã đọc, chưa kết luận toàn bộ hạ tầng deployed có thể khai thác vì chưa kiểm tra tất cả lớp proxy/network.

### F14 — P1: điều kiện hủy giữa AI và backend lệch nhau

Nguồn: [order_tools.py](../../avengers-coffee-system/services/ai-service/src/function_calling/tools/order_tools.py), `execute_cancel_order`; Order `huyDonHang` khoảng 3375.

Tool chỉ nhận một số alias mới tạo, không cho `DA_XAC_NHAN`; backend cho cả `MOI_TAO`, `DA_XAC_NHAN`. Sửa đơn backend còn cần COD, trong khi tool preview chỉ kiểm tra mới tạo. Cần lấy eligibility từ backend trước preview và revalidate khi commit.

### F15 — P1: sửa đơn có nguy cơ mất options và tổng preview lệch

Nguồn: `order_tools.execute_update_order`.

Tool lấy giá cơ sở menu, dựng items có size nhưng không đầy đủ topping/đá/đường như cấu trúc đơn; thành công trả tổng đã tính trước thay vì đọc tổng response. Cần preview/change service trả diff và tổng thật, giữ các trường không sửa, dùng version.

### F16 — P1: RAG chứa chính sách chưa khớp checkout

Nguồn: [ordering.json](../../avengers-coffee-system/services/ai-service/src/rag/raw_data/ordering.json), Order `khoiTaoThanhToan`, `huyDonHang`.

RAG nêu phí/freeship, nhiều ví ngoài và hoàn về phương thức ban đầu. Backend checkout đọc có 4 phương thức chính; nhánh hủy đã trả có thể gọi hoàn số dư vào ví khách. Chưa đủ bằng chứng phí RAG được tính trong checkout. Cần đối soát và duyệt chính sách, không coi tài liệu seed là capability đang vận hành.

### F17 — P1: kiosk và “gần nhất” cần phân biệt phạm vi

Nguồn: [branch_tools.py](../../avengers-coffee-system/services/ai-service/src/function_calling/tools/branch_tools.py), `execute_find_nearest_branch`, `execute_set_session_branch`, `execute_get_top_rated_stores`; Order `khoiTaoThanhToan`.

Tìm gần nhất đang dùng chi nhánh chính và Haversine; set branch/review có nhánh kiosk; checkout chuẩn có giá kiosk riêng và delivery mode `KIOSK`. “Kiosk review tốt” không tự trở thành cơ sở giao phù hợp. Cần outlet kind/capability và ghi rõ khoảng cách chim bay.

### F18 — P1: inventory hiện có API nhưng không chứng minh giữ hàng an toàn

Nguồn: [inventory.service.ts](../../avengers-coffee-system/services/inventory-service/src/modules/inventory/inventory.service.ts), `findAll`, `adjustStock`.

Có stock theo branch, nhưng `adjustStock` đọc rồi lưu `Math.max(0, stock + delta)`. Không thể suy rằng hai checkout đồng thời được bảo vệ khỏi oversell. Thiết kế reservation hoặc atomic conditional update; kiểm thử cạnh tranh có fixture tồn 1.

### F19 — P1: reset chat có side effect xóa giỏ

Nguồn: `ChatWidget.handleResetChat` khoảng 529; `main.clear_agent_cart`.

Nút “bắt đầu lại đoạn hội thoại” gọi DELETE cart; backend còn xóa giỏ chính. Cần chia thao tác bắt đầu hội thoại mới và xóa giỏ, với nội dung UI đúng hậu quả.

### F20 — P1: fallback có thể chuyển sang workflow khác sau lỗi

Nguồn: `ChatWidget.processAIMessage`.

Khi agent lỗi, frontend có thể gọi legacy order-intent rồi tạo pendingOrder. Nếu lỗi là timeout sau mutation, chuyển workflow không chứng minh mutation trước chưa chạy. Dùng operation status trước; fallback ngôn ngữ có thể hỗ trợ read-only khi chưa xác định kết quả.

### F21 — P1: tìm sản phẩm và prompt có thể tạo ngữ cảnh sai

Nguồn: `product_tools.execute_get_product_options` chọn `LIMIT 1`; `agent_service._AGENT_SYSTEM_PROMPT`.

Tên khớp nhiều món có thể bị chọn theo thứ tự hot/tên. Prompt đồng thời yêu cầu chọn chi nhánh trước và cấm hỏi chi nhánh ở bước món. Trả candidates và resolve ID; tách estimate khi chưa có cơ sở khỏi quote chốt đơn có đủ cơ sở.

### F22 — P1: nhiều tính năng hệ thống chưa có tool giao dịch trong chat

Nguồn: [tools/__init__.py](../../avengers-coffee-system/services/ai-service/src/function_calling/tools/__init__.py) có 22 tools; modules voucher/customer-wallet/gift-card/shipper/chat tồn tại riêng.

Registry chưa có tool áp voucher, quote phí ship, lấy vị trí/ETA giao, giao dịch gift card. UI cards và câu trả lời RAG chưa chứng minh bot thực hiện được các nghiệp vụ này. Cần capability registry, adapter và kiểm thử trước khi hứa hỗ trợ.

## 3. Những điểm không được suy ra từ đợt đọc code

- Không kết luận các log “test thành công” trong file hội thoại người dùng gửi là kết quả của đợt này.
- Chưa kiểm tra DB thật có dữ liệu menu/giá/options/địa chỉ/stock đầy đủ hay không.
- Chưa xác nhận cấu hình gateway, auth middleware toàn bộ deployment, secrets, model đang bật hoặc giới hạn provider.
- Chưa benchmark latency/token, chưa chạy order thật, chưa xác nhận event shipper/email/notification toàn luồng.
- Chưa định nghĩa thay chủ nghiệp vụ các chính sách giao/giờ mở/hoàn tiền/guest/kiosk; các điểm này được đưa vào backlog xác minh.

## 4. Thứ tự xử lý gắn với bằng chứng

1. F01/F07/F08/F09/F13: bảo đảm actor, action, kết quả và tạo đơn đúng một lần.
2. F02/F03/F04/F05/F06/F18: giỏ, options, địa chỉ, tiền và tồn kho đúng dữ kiện.
3. F10/F11/F12/F19/F20: memory, đồng bộ UI, reset, fallback và khôi phục.
4. F14/F15/F16/F17/F21/F22: policy, khả năng hệ thống, tư vấn và các miền nghiệp vụ mở rộng.

Mỗi nhóm có test trước/sau theo [CONVERSATION_TEST_PLAN.md](CONVERSATION_TEST_PLAN.md). Việc tất cả ca mẫu qua được là evidence có giới hạn trên bộ test đó, không phải bảo đảm tuyệt đối mọi câu khách có thể nói.
