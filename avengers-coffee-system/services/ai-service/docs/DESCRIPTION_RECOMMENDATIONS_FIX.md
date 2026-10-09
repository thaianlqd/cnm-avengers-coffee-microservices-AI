# Gợi ý theo nhu cầu và mô tả sản phẩm

Checkpoint 2026-10-07, customer chatbot. Không thay đổi Data Platform AI.

## Bằng chứng và nguyên nhân

Log khoảng 19:04 giờ Việt Nam (12:04 UTC), conversation `759a7840-47f2-45e9-a323-76455e61c998`, turn `32d98c30-0280-4197-b5cb-e731d7d7996c`: câu “hôm nay trời nóng quá” được model chuyển thành `get_recommendations(criteria="hot", period="month", category="all", top_k=5)`. Trace lưu trong DB cũng ghi `ranking=completed_paid_quantity`.

`hot` trong tool là doanh số, không phải nhu cầu theo thời tiết. Tool còn mặc định `hot` và chưa có chế độ tìm nhu cầu trên mô tả. Kết quả gồm bánh vì category=all. Danh sách sản phẩm đến từ đơn hoàn thành, đã thanh toán; không phải danh sách tên sản phẩm cố định. Tuy nhiên tiêu chí sai và phần trình bày doanh số có mẫu cố định nên không giải thích được sự phù hợp với nhu cầu. Không có đọc mô tả/RAG trong lượt này; provider không báo lỗi.

## Thay đổi

- Model thấy tiêu chí `bestsellers` thay cho tên mơ hồ `hot`. Tên cũ chỉ giữ cho khả năng tương thích phía server; hai tên dùng chung nguồn doanh số/cache.
- Production semantic gateway không tự điền tiêu chí bán chạy nếu model bỏ qua tiêu chí: yêu cầu một lần sửa protocol nội bộ. `preferences` phải có `preference_query`.
- Tool có chế độ `preferences`: tìm trên mô tả đã duyệt `menu.san_pham.mo_ta`, domain `product_description`, rồi đối chiếu từng canonical ID với Menu hiện tại (đang bán, đúng nhóm, tên/giá/hình hiện tại). ID filter là tham số SQL bind nội bộ, model không được cung cấp `product_ids`.
- Dùng RAG sparse TF-IDF word/character hiện có, không gọi embedding hoặc model bổ sung. Truy vấn tìm kiếm do LLM diễn giải từ nhu cầu, không có bảng từ khóa thời tiết, danh sách món cố định hay regex phân loại câu tiếng Việt mới.
- Dùng chung bộ lọc nguồn, dynamic facts và instruction-like evidence với tool kiến thức. Chỉ mô tả của đúng canonical ID được đính kèm và hiển thị; không suy ra thành phần/an toàn dị ứng từ tên món.
- Một truy vấn gợi ý hoàn tất có thể trả thẳng kết quả mô tả và Menu, không cần model viết lại sự phù hợp. Nếu không có mô tả khớp hoặc nguồn lỗi, trả thông báo tương ứng/hỏi thêm sở thích, không đổi sang bán chạy hoặc tạo sản phẩm từ câu trả lời model.
- Prompt và capability phân biệt xã giao, gợi ý theo nhu cầu và yêu cầu doanh số; xã giao có thể đáp lại hoặc hỏi sở thích mà không gọi tool. Hành vi chọn mua, tùy chọn và giỏ hàng giữ authority hiện có.

## Kiểm chứng

Full suite sau thay đổi: **2737 passed, 0 failed, 1 skipped, 2 warnings in 19.30s**. So với checkpoint trước (2717 passed), thêm 20 trường hợp trong `tests/test_description_recommendations.py`.

Test chạy Docker `--network none`, scripted provider, dữ liệu mô tả giả lập qua RAG thực và Menu stubs. Bao phủ relevance -> Menu, sản phẩm ngừng bán/sai nhóm, dữ liệu độc hại/nguồn không duyệt, RAG lỗi/không khớp, criteria thiếu cần repair, schema model không có `hot`/internal IDs, không trả lời theo doanh số khi thiếu mô tả, doanh số hợp lệ vẫn dùng sold_desc, xã giao không ghi giỏ và SQL IDs dùng bind. Những cách diễn đạt khác nhau dùng đầu ra semantic giả lập để kiểm tra server không áp đặt parser câu chữ; không phải phép đo khả năng hiểu ngôn ngữ của Gemini thật.

Lệnh từ repository root:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

Log: `/private/tmp/chatbot-description-full.log`. AST parse 10 file thay đổi và `git diff --check` thành công. Skip Redis integration và hai cảnh báo thư viện là các trường hợp đã có.

**0 request Gemini/Vietmap thật để test, không dùng key của người dùng.** Chưa xác minh NLU của model thật sau sửa. RAG hiện dựa vào độ khớp từ/character với threshold hiện có; nội dung mô tả và query model tạo quyết định độ phủ. Lấy tối đa 10 retrieval chunks trước khi lọc Menu, nên có thể trả ít hơn số món yêu cầu; không tự bổ sung bằng sản phẩm kém liên quan.

## Container đang chạy

Build `docker compose build ai-service`, rồi `docker compose up -d --no-deps ai-service` thành công. Chỉ recreate `avengers_ai_service`, không dùng `--remove-orphans`; các container Data Platform giữ nguyên.

Health `/ai/health`: HTTP 200, status=ok, chat_orchestrator_mode=llm_tools, agent_provider=gemini, redis_available=true. Health không gửi chat/gọi model. SHA-256 9 file production của lượt sửa này khớp workspace/container, 0 mismatch.

Log build/deploy: `/private/tmp/chatbot-description-build.log`, `/private/tmp/chatbot-description-deploy.log`. Các thay đổi giữ local để review, không commit/reset/revert thay đổi trước đó.
