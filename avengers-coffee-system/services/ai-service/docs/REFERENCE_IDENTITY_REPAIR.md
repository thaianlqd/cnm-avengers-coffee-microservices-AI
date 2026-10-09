# Số hiển thị và canonical ID — 2026-10-07

Phạm vi: customer chatbot, tiếp tục worktree hiện tại trên HEAD `9a0d4b46fa989e2d1e0471efd493004f2f77f434`. Không sửa Data Platform. Không dùng API key hoặc gọi Gemini thật trong lượt này.

## Bằng chứng từ lượt 18:19

Cuộc hội thoại `4c3655ba-7a42-43d8-871a-61f2c8bb7c78`:

- 11:19:15 UTC: `resolve_location` trả về `ambiguous` và hiển thị hai địa điểm.
- 11:19:38 UTC: model gọi đúng tool `select_location_candidate`, commitment `AFFIRMED`, nhưng không có typed reference. Server trả `unknown_reference`, `recovery_kind=clarify`.
- Kiểm tra SELECT/GET riêng record lỗi và snapshot của cuộc hội thoại xác nhận model gửi **`candidate_id="1"`**. Hai địa điểm có ID server khác, đều có `display_index` và tọa độ đầy đủ. Snapshot Redis và DB vẫn giữ cả hai; pending owner vẫn là `select_location_candidate`.

Đây là lỗi biểu diễn đối tượng ở ranh giới model/server: model dùng số thứ tự danh sách làm ID; server phân loại đề xuất ID sai thành khách hàng chưa chọn rõ. Không có bằng chứng mất danh sách hay mất tọa độ. Không in key, toàn bộ hồ sơ hoặc địa chỉ riêng tư khi đọc dữ liệu chẩn đoán.

## Thay đổi chung

`src/agents/semantic_control.py`:

- Contract model nói rõ số danh sách dùng `reference.kind=ordinal` và `reference.index`. Khi reference cung cấp đối tượng, bỏ ID tương ứng trong args. ID chỉ được sao chép từ canonical server rows.
- Nếu model đưa ID không tồn tại trong namespace nhưng server đang có candidate hợp lệ, trả feedback `model_repair` với namespace, target field và candidate count. Giữ status lỗi grounding; không thực hiện business action.
- Nếu reference đúng nhưng model đồng thời đưa một ID bịa vào args, yêu cầu sửa biểu diễn đó. Hai canonical ID thật xung đột vẫn là conflict, không chọn hộ.
- Không tự ép chuỗi số thành ordinal: ID thật hoàn toàn có thể là số. Không có candidate, ordinal ngoài danh sách hoặc singleton có nhiều mục vẫn đi theo clarification hiện có.

Áp dụng cùng cơ chế cho PRODUCT, CART_LINE, VOUCHER, BRANCH, LOCATION_CANDIDATE, ORDER và MENU_CATEGORY; giữ các ngoại lệ có sẵn cho mã voucher/order ID do khách cung cấp trực tiếp và được business service kiểm tra. Không thêm regex nhận diện câu hoặc địa chỉ.

`src/agents/tool_policy.py`: log thêm target field và số candidate khi repair; không log raw IDs/addresses/prompt.

`src/agents/tool_artifacts.py`: khi một thao tác giỏ đã thành công nhưng thao tác sau cần sửa protocol, fallback vẫn hiển thị kết quả giỏ đã thực hiện và nói rõ phần còn lại chưa xong. Không báo hoàn tất cả batch và không ghi lại thao tác đã thành công.

Luồng repair sử dụng budget có sẵn: tối đa một lần sửa protocol trong cùng lượt, giữ chính sách provider/key hiện có, không thêm classifier call hay tăng tool-round budget. Một đề xuất hợp lệ ngay từ đầu không phát sinh request repair. Sau repair, chọn map candidate vẫn đi qua validation địa chỉ, nhánh phục vụ và checkout; tọa độ provider giữ nguyên, không geocode lại. Tạo đơn vẫn cần xác nhận sau summary ở lượt khác.

## Kiểm chứng

Thêm `tests/test_reference_identity_repair.py`, 17 ca:

- ID model không hợp lệ trên bảy namespace yêu cầu repair và không ghi business state.
- Số ngoài danh sách, singleton mơ hồ, không có candidate vẫn cần clarification.
- ID số thật không bị hiểu thành vị trí hiển thị.
- ID bịa đi kèm ordinal được yêu cầu sửa; hai ID thật xung đột không được đoán.
- Ba cách diễn đạt chọn vị trí qua loop thật: ambiguous lookup → model gửi ID `"1"` → model sửa thành ordinal → dùng đúng candidate/tọa độ → summary; không xác nhận đơn, không replay khi lặp client message ID.
- Lặp đề xuất ID sai dừng ở budget repair hiện có.

Trước sửa production: **12 failed, 4 passed** trên 16 ca đầu, log `/private/tmp/chatbot-reference-repair-before.log`. Sau bổ sung thêm ca conflict canonical ID và sửa production, full suite: **2.676 passed, 0 failed, 1 skipped**, 2 deprecation warnings, 17.08 giây. Ca Redis integration skip có sẵn không thay đổi.

Lệnh kiểm chứng đầy đủ từ repository root:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

Log cuối: `/private/tmp/chatbot-reference-repair-final.log`. AST trên các file Python của lượt này và `git diff --check` đều thành công. Test partial-batch hiện có giữ assertion quantity/giỏ và chỉ bỏ phụ thuộc viết hoa chữ “Giỏ” khi dùng renderer chuẩn.

Tất cả pytest chạy với `--network none`, scripted model và business authorities giả lập. **0 request Gemini thật.** Kết quả chứng minh cơ chế server/repair và các invariant an toàn với đầu ra model được kiểm soát; không phải phép đo độ chính xác NLU thực tế của Gemini.

## Đã áp dụng tại máy

`docker compose build ai-service` và `docker compose up -d --no-deps ai-service` thành công, chỉ recreate `avengers_ai_service`. `/ai/health` trả HTTP 200, `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, Redis available. SHA-256 ba file production của lượt này khớp workspace/container, không có mismatch. Không reset cuộc hội thoại, không thay đổi giỏ hoặc tự chọn địa chỉ trong phiên thật. Log build/deploy: `/private/tmp/chatbot-reference-repair-{build,deploy}.log`. Thay đổi vẫn chưa commit.
