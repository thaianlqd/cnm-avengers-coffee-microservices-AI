# Xử lý 113 test lỗi cũ — 2026-10-07

Phạm vi: customer chatbot trong `avengers-coffee-system/services/ai-service`. HEAD vẫn là `9a0d4b46fa989e2d1e0471efd493004f2f77f434`, branch `branch_thaian`. Tiếp tục các thay đổi local có sẵn; không reset, chuyển branch hoặc commit. Không sửa Data Platform.

## Kết quả

| Bộ test đầy đủ | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Trước lượt xử lý này | 2.546 | 113 | 1 |
| Sau xử lý | 2.659 | 0 | 1 |

113 là **số ca pytest thất bại**, không phải 113 lỗi runtime độc lập. Nhiều ca dùng chung một fixture hoặc cùng kỳ vọng protocol cũ. Đã xử lý tất cả các nhóm; không xóa hàm test và không thêm skip/xfail. Ca skip có sẵn là `test_agent_redis_integration.py`, chỉ chạy khi bật `AI_AGENT_REDIS_INTEGRATION=1` để dùng Redis thật. Hai warning còn lại là deprecation từ LangGraph và Starlette.

## Lỗi code đã sửa trong lượt này

- **Tham chiếu theo nhóm món:** snapshot cũ chỉ có danh sách chung không cung cấp `food_products`/`drink_products`, khiến semantic grounder không hiểu ordinal theo nhóm. Dựng lại nhóm từ danh mục Menu chuẩn và giữ thứ tự hiển thị; không suy nhóm từ tên món. ID model đưa ra khác kết quả grounding vẫn bị từ chối.
- **Chọn nhiều món:** `add_to_cart` với ý nghĩa SELECT dừng batch khi món đầu cần size, làm mất việc chọn món kế tiếp. Cho phép tiếp tục SELECT kế tiếp để ghi nhận draft riêng. Các thao tác phụ thuộc khác vẫn dừng khi chưa đủ điều kiện; mỗi action vẫn phải qua grounding và policy.
- **Discovery:** bỏ fallback tự gộp toàn bộ candidate từ nhiều lượt tìm kiếm thành món hiển thị khi chưa có lựa chọn hợp lệ. Giữ yêu cầu total/count và chỉ xuất canonical selection đã kiểm tra. Phần hướng dẫn chọn theo nhóm dùng cùng ordinal với thẻ UI.
- **Availability presentation:** kết quả inventory thiếu trường không còn gây lỗi truy cập khóa; chỉ hiển thị `available` khi có `is_fully_available=True` và không có blocker. Thiếu xác nhận được biểu diễn là `unknown`.
- **Tương thích option draft cũ:** model đoán sai tùy chọn không còn xóa giá trị khách đã chọn trước đó. Yêu cầu mặc định giữ lựa chọn đã xác nhận; yêu cầu tự chọn chỉ giữ draft và hiện Menu, không tự commit một draft đã đủ trường.
- **Tương thích topping cũ:** dấu nối trước tùy chọn tiếp theo không còn dính vào nhãn topping; tên sản phẩm đã được xác định làm đối tượng sửa không bị hiểu thành topping. Giữ dấu phẩy để không làm mất ranh giới các giá trị; giá trị ngoài Menu vẫn bị từ chối.
- **Router tương thích cũ:** câu hỏi sản phẩm đã được xác định không còn bị nhánh tham chiếu địa điểm chiếm luồng.

Các xử lý raw-text tương thích chỉ ở nhánh legacy; luồng semantic production vẫn dùng ý nghĩa từ model và grounding/policy từ server. Không thêm bộ từ đồng nghĩa theo sản phẩm, địa chỉ hoặc các câu khách đã báo. Không đổi thứ tự model Gemini trong lượt này.

## Những thay đổi test có chủ đích

- Fixture cho các ca cấu hình phải có **pending product đã được chọn**, thay vì chỉ có visible/focus. Nhìn thấy món không phải quyền cấu hình hoặc dùng mặc định.
- Test đề xuất tool và lỗi provider phải đi qua scripted provider, tránh legacy shortcut xử lý trước và khiến đề xuất lỗi chưa từng được chạy. Các test legacy router riêng vẫn chạy trong full suite.
- Các hành trình compound và ordinal chuyển sang `customer_actions` có commitment, evidence, option intent và namespace; server vẫn kiểm tra canonical identity. Fixture Menu dùng `M/L` thì lựa chọn gửi vào dùng chính nhãn đó.
- Mock inventory chuyển sang truy vấn batch hiện tại; mock bản đồ chuyển sang `resolve_location` hiện tại. Khi provider bản đồ lỗi, kỳ vọng là báo lỗi và không dựng tọa độ giả.
- Voucher/checkout chuẩn bị đúng offer và quyết định trước khi gọi capability. Kiểm tra từ chối ID, auth, thiếu prerequisite vẫn được thực hiện trực tiếp ở gateway khi capability chưa được exposure cho model.
- Test Gemini transport phản ánh việc bỏ JSON response format ở request có tools, nhưng vẫn kiểm tra retry format ở final-only, cùng key, signed history và không replay write.
- Cập nhật số capability do có `get_menu_categories`, định dạng giỏ hiện hành, nhãn địa chỉ chuẩn và chính sách giữ toàn bộ voucher đủ điều kiện. Không tăng budget prompt hoặc model request để làm test qua.
- Test compound legacy trước đây mong tự hoàn tất cả hai món từ một câu option chưa xác định đủ mục tiêu; nay yêu cầu mặc định cho bánh và size cho nước một cách rõ ràng, vẫn kiểm tra toàn bộ topping, tổng tiền, voucher, checkout và idempotency.

## 113 ca ban đầu nằm ở đâu

Một module có thể chứa nhiều nguyên nhân; bảng này thống kê đúng failed node trong log baseline, không gán toàn bộ module thành lỗi production.

| Module test | Failed ban đầu |
| --- | ---: |
| test_agent_redis_memory.py | 1 |
| test_branch_latency_checkout_presentation.py | 3 |
| test_branch_selection_flow.py | 1 |
| test_cart_line_context.py | 1 |
| test_cart_voucher_checkout_flow.py | 2 |
| test_chat_completion_pass.py | 2 |
| test_chat_flow_safety.py | 3 |
| test_checkout_guarded_contract.py | 5 |
| test_compound_discovery_contract.py | 3 |
| test_custom_option_followup.py | 12 |
| test_customer_checkout_presentation.py | 8 |
| test_gemini_guarded_continuation.py | 5 |
| test_guarded_tool_gateway.py | 17 |
| test_guest_cart_login_boundary.py | 1 |
| test_lan21_demo_readiness.py | 1 |
| test_llm_tool_orchestrator.py | 1 |
| test_location_checkout_boundary.py | 1 |
| test_mixed_cart_presentation.py | 1 |
| test_numbered_category_choices.py | 7 |
| test_optional_defaults_description_contract.py | 5 |
| test_provider_outage_presentation.py | 1 |
| test_reported_shopping_journeys.py | 3 |
| test_surgical_recommendation_regressions.py | 1 |
| test_voucher_profile_boundaries.py | 27 |
| test_wallet_topup_contract.py | 1 |
| **Tổng** | **113** |

## Kiểm chứng và áp dụng

Mọi lần pytest trong lượt này dùng container `--network none`, scripted providers và business stubs. **0 request Gemini thật; không dùng key của người dùng.** Kết quả này kiểm chứng server/protocol bằng đầu ra model giả lập, không đo độ chính xác ngôn ngữ của model thật.

Lệnh full suite cuối cùng, từ repository root:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

Kết quả: `2659 passed, 1 skipped, 2 warnings in 15.92s`. Log baseline: `/private/tmp/chatbot-pending-options-full.log`; log cuối: `/private/tmp/chatbot-suite-repair-7.log`. Kiểm tra AST thành công trên 36 file Python thay đổi; `git diff --check` thành công. Kiểm tra diff không có hàm test bị xóa.

`docker compose build ai-service` và `docker compose up -d --no-deps ai-service` thành công; chỉ recreate `avengers_ai_service`, không dùng `--remove-orphans`. Health `/ai/health`: HTTP 200, `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, `redis_available=true`. SHA-256 cả 12 file production đang thay đổi khớp giữa workspace và container, không có mismatch. Health không gọi model.

Log build/deploy: `/private/tmp/chatbot-suite-repair-{build,deploy}.log`. Thay đổi vẫn để local cho review.

## Lần sửa tiếp theo

Lỗi đọc giỏ rồi báo đã áp dụng mặc định được xử lý riêng trong [TURN_COMPLETION_EVIDENCE_FIX.md](TURN_COMPLETION_EVIDENCE_FIX.md), checkpoint 2026-10-07: 2.694 passed, 0 failed, 1 skipped. Các số liệu baseline bên trên thuộc checkpoint lịch sử của đợt sửa 113 lỗi.

Lỗi đối chiếu địa chỉ sau khi bổ sung thành phố: [ADDRESS_COMPONENT_GROUNDING_FIX.md](ADDRESS_COMPONENT_GROUNDING_FIX.md), checkpoint tiếp theo: 2.717 passed, 0 failed, 1 skipped; 0 request Gemini/Vietmap thật để test.

Lỗi dùng doanh số để trả lời nhu cầu/thời tiết: [DESCRIPTION_RECOMMENDATIONS_FIX.md](DESCRIPTION_RECOMMENDATIONS_FIX.md), checkpoint tiếp theo: 2.737 passed, 0 failed, 1 skipped; thêm luồng tìm theo mô tả sản phẩm và tách tiêu chí bestsellers. 0 request Gemini/Vietmap thật để test.
