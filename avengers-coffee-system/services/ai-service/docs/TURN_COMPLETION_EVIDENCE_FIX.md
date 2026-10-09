# Đọc giỏ không phải hoàn tất cấu hình — 2026-10-07

Phạm vi: customer chatbot, tiếp tục worktree có thay đổi từ trước trên HEAD `9a0d4b46fa989e2d1e0471efd493004f2f77f434`. Không sửa Data Platform, `.env`, business tools hay phiên/giỏ thật. Theo yêu cầu mới nhất của người dùng: **không dùng key để test; 0 request Gemini thật**.

## Bằng chứng và nguyên nhân

Đã đọc log 18:34–18:39 và SELECT/GET riêng dữ liệu cần chẩn đoán của cuộc hội thoại `91fb9f2f-77da-458b-ac05-32ad4ed4884b`, không sửa state:

- Lượt chọn món đã gọi `add_to_cart(product_id="40")`, trả `needs_options`, thiếu `size`. Pending product và focus vẫn tồn tại.
- Lượt “theo mặc định cho tôi đi bạn” chỉ thực hiện `get_cart` rồi đọc lại cùng kết quả. Không có `add_to_cart`, không có write thành công. Giỏ vẫn trống, nhưng model nói đã thiết lập mặc định.
- Vòng lặp tắt tools sau read lặp; sửa JSON cuối lượt cũng tắt tools dù cấu hình chưa xong. Kiểm tra envelope không yêu cầu bằng chứng cho `response_kind=action`; kiểm tra câu chữ trước đó không bắt mọi cách diễn đạt. Model bỏ `mutation_claims` vẫn có thể đưa lời xác nhận sai.
- Lượt hỏi giỏ tiếp theo đọc đúng giỏ trống nhưng trả lời bỏ qua pending selection. Đây không phải mất state, lỗi giá/size authority hay provider outage.

Log chẩn đoán: `/private/tmp/chatbot-defaults-1836.log`. Không đưa secret/hồ sơ đầy đủ vào báo cáo.

## Sửa cơ chế chung

1. **Kiểm tra hoàn tất bằng cấu trúc:** một envelope `action` chỉ có bằng chứng read thành công không được đóng lượt như đã thực hiện thay đổi. Trả feedback nội bộ để model thực hiện action đúng với current evidence/canonical reference, hoặc sửa thành consultation nếu khách chỉ hỏi. Business action đã thực hiện nhưng không đổi giá trị (`changed=false`) vẫn là bằng chứng thực thi hợp lệ; không bắt ghi lại để hợp thức hóa câu trả lời.
2. **Giữ khả năng dispatch:** nếu chỉ đọc giỏ lặp trong khi còn pending, cho một cơ hội điều hướng lại trong budget tool rounds hiện có. Không tăng budget, không thêm classifier call, không ép write cho câu hỏi. Lặp tiếp vẫn dừng theo cơ chế cũ. Metric `read_completion_repair_count` ghi nhận lần điều hướng này.
3. **Không đóng draft bằng sửa định dạng:** khi chỉ có cart reads và pending configuration, không dùng nhánh sửa JSON với tools bị tắt. Model còn có thể gửi action trong budget còn lại. Các final-envelope repair của discovery/luồng đã hoàn tất giữ nguyên.
4. **Tách read evidence:** projection của cart reads có `completion.mutated=false`, cờ pending configuration và canonical pending rows riêng khỏi committed cart. Dùng cùng projection với context, nhưng không sao chép option schema vào mỗi read result; schema vẫn ở context để tránh tăng token không cần thiết.
5. **Phản hồi từ trạng thái thật:** lượt chỉ đọc cart/quote được render từ tool result và pending state, thay cho prose tùy ý. Hiển thị món đã vào giỏ, món chưa vào giỏ, số lượng và Menu options còn chờ. Vì vậy kể cả model gắn nhãn consultation hoặc bỏ response kind nhưng nói đã thiết lập, câu xác nhận sai không được gửi cho khách.

NLU vẫn do model quyết định. DEFAULTS vẫn cần current `defaults_evidence`; pending không tự cho phép dùng mặc định. Product/option/price/stock/auth/idempotency/checkout/confirmation authority giữ nguyên. Không thêm regex theo câu, tên món, địa chỉ hay danh sách từ đồng nghĩa tiếng Việt. Không tự thêm món để làm cho lời xác nhận sai trở thành đúng.

Các file production của lượt này: `agent_context.py`, `customer_flow_presentation.py`, `llm_tool_orchestrator.py`, `semantic_control.py`, `tool_artifacts.py`, `groq_service.py`.

## Kiểm chứng

Thêm `tests/test_turn_completion_evidence.py`, **18 ca** với loop/gateway/state thật và provider/business authorities giả lập:

- Read → action envelope thiếu write → sửa DEFAULTS trong cùng lượt, ba cách diễn đạt; không replay khi lặp client message ID.
- Read lặp → còn một cơ hội dispatch, cache tiếp tục hoạt động, chỉ một lần feedback.
- Chuỗi tái hiện no-tool prose → get_cart → get_cart lặp → prose thiếu JSON → DEFAULTS vẫn thực thi, tổng 5 scripted provider requests trong budget có sẵn.
- Read lặp tiếp dừng; fallback không nói đã thiết lập, vẫn hiển thị đúng pending.
- Model gắn nhãn consultation hoặc bỏ kind nhưng nói đã thiết lập: render sự thật, không tự ghi giỏ.
- Hỏi giỏ thật, nhiều pending products, social và interruption không phát sinh write.
- Action completion áp dụng cho fulfillment, không phụ thuộc câu/món cụ thể; no-op business action không bị từ chối.
- Projection tách committed/pending, không lặp option schema.

Trước sửa production, 13 ca đầu: **11 failed, 2 passed**, log `/private/tmp/chatbot-completion-before.log`. Nhóm focused sau bản sửa đầu: **220 passed**, log `/private/tmp/chatbot-completion-focused.log`. Sau các ca bổ sung và chỉnh nhánh format repair, full suite cuối: **2.694 passed, 0 failed, 1 skipped**, 2 deprecation warnings, 18.39 giây; log `/private/tmp/chatbot-completion-full-final.log`. Ca Redis integration skip có sẵn không thay đổi. Checkpoint trước lượt này là 2.676 passed; lượt này thêm 18 ca, không xóa/skip test để giảm lỗi.

Lệnh full suite từ repository root:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

Focused dùng cùng Docker invocation, với `tests/test_turn_completion_evidence.py tests/test_semantic_control.py tests/test_chatbot_semantic_regressions.py tests/test_reference_identity_repair.py`. AST 7 file Python của lượt này và `git diff --check` thành công. Không có thay đổi Data Platform trong diff.

**Giới hạn kiểm chứng:** đây là kiểm thử cơ chế server với đầu ra model được kiểm soát, không phải đo độ chính xác NLU của Gemini. Không có số liệu live first-attempt rate, live token/latency hoặc cam kết model luôn chọn đúng tool. Khi model không sửa được trong budget, hệ thống phải nói đúng việc chưa hoàn tất thay vì xác nhận thành công. Luồng hợp lệ không có classifier hay repair call bổ sung; ca lỗi mới có feedback trong budget cũ.

Hành trình kiểm tra tay: chọn món có required options → yêu cầu mặc định → kiểm tra món đã vào giỏ với options/giá Menu → hỏi giỏ; với nhiều món, cấu hình riêng từng món và kiểm tra không trộn topping. Hỏi tùy chọn/giỏ hoặc đổi chủ đề phải giữ draft, không tự thêm vào giỏ.

## Đã áp dụng tại máy

`docker compose build ai-service` và `docker compose up -d --no-deps ai-service` thành công; chỉ recreate `avengers_ai_service`, không dùng `--remove-orphans`. Health `/ai/health` trả HTTP 200, `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, `redis_available=true`. SHA-256 cả sáu file production của lượt này khớp workspace/container. Health/hash checks không gọi model. Log build/deploy: `/private/tmp/chatbot-completion-{build,deploy}.log`. Thay đổi còn local, chưa commit.
