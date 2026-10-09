# Địa chỉ nhiều lượt và đối chiếu bản đồ — 2026-10-07

Phạm vi: customer chatbot, tiếp tục worktree có thay đổi local trên HEAD `9a0d4b46fa989e2d1e0471efd493004f2f77f434`. Không sửa Data Platform hoặc `.env`. **0 request Gemini/Vietmap thật để test**, theo yêu cầu không sử dụng key của người dùng.

## Bằng chứng lượt 18:51–18:52

Đọc log `/private/tmp/chatbot-address-followup-1852.log` và SELECT riêng tool args/results của cuộc hội thoại `0ed21b95-2dd2-499c-ae84-0257ccca3ff8`:

- Lượt địa chỉ thiếu thành phố gọi `resolve_location` với `kind=address`, `for_checkout=true`, lưu phần địa chỉ và hỏi đúng tỉnh/thành phố.
- Lượt bổ sung TP.HCM, model đã gửi **địa chỉ đầy đủ**, gồm số nhà, đường, phường, Bình Thạnh và thành phố. Không phải LLM bỏ mất địa chỉ trước đó.
- Địa chỉ đầy đủ vẫn bắt đầu bằng `số 40 đường …`. Gateway semantic giữ nguyên literal này khi gọi adapter, trong khi parser cấu trúc nhận diện địa chỉ và bỏ phần dẫn trước số nhà. Bộ đối chiếu geo tự dùng một regex khác, chỉ nhận house number ở đầu chuỗi và không xử lý designator `số`.
- Vì vậy bộ đối chiếu có thể coi cả `số 40 đường …` là tên đường; cả kiểm tra address lẫn chọn preview đều thất bại với place detail dạng số nhà/đường thông thường, dẫn đến `rejected` và không có candidate. Nhánh model gửi riêng city fragment lại đi qua parser ghép địa chỉ nên không có lỗi này.
- Không có provider failure trong ba lượt liên quan. Payload place detail của lần chạy thật không được lưu đầy đủ; không gọi lại API để thu payload. Lỗi chuẩn hóa trên đã tái hiện offline với cùng hình dạng tool args và provider fields chuẩn, không khẳng định có thể khôi phục mọi chi tiết response bản đồ cũ.

Phát hiện thêm: `partial_delivery_address` nằm trong checkout prefs nhưng bị bỏ khỏi context gửi model. Luồng hiện tại còn đọc được nó từ history, nhưng history compaction có thể làm mất thông tin với model.

## Thay đổi

`utils/geo.py`:

- Một bộ tách header địa chỉ dùng chung cho validation, preview, locality và pickup-origin estimate. Tách house number khỏi street, xử lý designator `số`/`đường` như định dạng của typed address; không phân loại intent từ câu khách.
- Giữ nguyên chữ/số, ký tự hậu tố và cấu trúc số nhà; không bỏ số nằm trong tên đường.
- So khớp street identity đầy đủ với **resolved place detail**. Không dùng search snippet lặp lại câu query làm bằng chứng xác nhận tên đường. Trường `street` cấu trúc được ưu tiên khi có; số nhà cấu trúc `house_number` cũng được kiểm tra trực tiếp.
- Kiểm tra house/admin vẫn bắt buộc theo policy hiện tại. Địa chỉ tương tự nhưng khác số nhà hoặc khác khu vực không tự được xác nhận. Nhánh estimate chỉ phục vụ tìm quán pickup/dine-in theo quyền cũ; không áp dụng thay cho validation giao hàng. Giữ tương thích provider display có tên doanh nghiệp đứng trước số nhà trong nhánh estimate.
- Thêm `rejection_reasons` với mã lý do chung, không chứa key/địa chỉ/prompt. Preview có street phù hợp nhưng số nhà sai vẫn được giữ là `accepted=false`, để khách xem và chọn theo luồng hiện có.

`branch_tools.py`: ghi log `[LocationValidation]` và trả các mã lý do từ chối, để phân biệt chưa xác minh street, house number, admin hay tọa độ thay vì chỉ biết `rejected`.

`agent_context.py`, `checkout_contract.py`: đưa địa chỉ đang thiếu thông tin vào context bền vững và workflow hint. Follow-up tiếp tục draft, chỉ hỏi phần còn thiếu. Model vẫn sở hữu semantics; server không tự suy ra thành phố, địa chỉ hồ sơ, tọa độ hoặc xác nhận đơn.

Không có tên đường, địa danh hay số nhà cụ thể trong production rules mới. Regex mới là cú pháp trường địa chỉ, không phải dictionary câu tiếng Việt hay bộ nhận diện intent thứ hai. Không thay đổi provider endpoints, business tools về giỏ/giá/stock, authentication, idempotency, tọa độ candidate hay yêu cầu xác nhận checkout. Không thêm provider/classifier call, không tăng budget.

## Kiểm chứng

Thêm `tests/test_address_component_grounding.py`, **23 ca**:

- Optional house/road designators, hoa/thường; house number có hậu tố, hẻm, block và dấu nối.
- Sai số nhà, street suffix, ward/district/city; search echo hoặc street field mâu thuẫn không thay được resolved authority.
- Provider chỉ có house-number field cấu trúc; tên đường có số.
- Preview khi số nhà không khớp vẫn ghi chưa được chấp nhận.
- Loop semantic thật → địa chỉ thiếu city → bổ sung city bằng fragment hoặc full address → geo validator thật với HTTP provider giả lập → hai canonical candidates. Không hỏi lại địa chỉ đầy đủ, không tự xác nhận, không replay khi lặp client message ID.
- Partial address tồn tại trong model context sau khi history bị compact.

Trước sửa, 22 ca đầu: **17 failed, 5 passed**; gồm các kỳ vọng diagnostic/context mới, không phải 17 lỗi runtime độc lập. Log `/private/tmp/chatbot-address-before.log`.

Focused: **137 passed**, log `/private/tmp/chatbot-address-focused.log`. Full suite đầu phát hiện một regression của pickup estimate có company prefix: **1 failed, 2.716 passed, 1 skipped**. Đã sửa implementation để giữ hành vi cũ, không sửa/bỏ test đó. Full suite cuối: **2.717 passed, 0 failed, 1 skipped**, 2 deprecation warnings, 19.58 giây. Log `/private/tmp/chatbot-address-full-final.log`. Ca Redis integration skip có sẵn không thay đổi. Checkpoint trước lượt này: 2.694 passed; thêm 23 ca.

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

Focused dùng cùng Docker invocation với `tests/test_address_component_grounding.py tests/test_global_conversation_contract.py tests/test_final_location_recovery_hardening.py tests/test_reference_identity_repair.py tests/test_location_checkout_boundary.py`. AST năm file Python của lượt này và `git diff --check` đều thành công.

Tất cả pytest chạy với `--network none`; model và HTTP map provider đều giả lập, không dùng credentials thật. Đây là kiểm chứng canonical normalization, state và safety invariants, không phải đo live NLU hoặc tình trạng dữ liệu bản đồ hiện tại. Provider vẫn có thể thực sự không tìm thấy/không xác minh được địa chỉ; hệ thống phải giữ kiểm tra và phản hồi theo bằng chứng, không dựng tọa độ để cho qua.

## Đã áp dụng tại máy

`docker compose build ai-service` và `docker compose up -d --no-deps ai-service` thành công; chỉ recreate `avengers_ai_service`, không dùng `--remove-orphans`. Health `/ai/health` trả HTTP 200, `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, `redis_available=true`. SHA-256 bốn file production của lượt này khớp workspace/container. Health/hash checks không gọi model hoặc bản đồ. Log build/deploy: `/private/tmp/chatbot-address-{build,deploy}.log`. Chưa commit; không tự sửa giỏ/địa chỉ của phiên thật.
