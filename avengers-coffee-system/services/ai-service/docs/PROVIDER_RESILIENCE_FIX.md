# Customer chatbot: provider transport / resilience

Checkpoint 2026-10-07 (giờ Việt Nam). **LIVE_PROVIDER_REQUESTS = 0**.

## 1–2. Điểm bắt đầu và workspace

Starting HEAD: `af720274c48d2aeea49b02d0820d13662114dfc1`, branch `branch_thaian`. `git status --short`, `git diff`, `git diff --cached` sạch trước sửa. Không reset, checkout, discard, commit hoặc đụng Data Platform. Rollback reference chỉ là tham chiếu, không được sử dụng.

Đã đọc policy, wrappers, Gemini metadata, orchestrator, gateway, ba test provider được yêu cầu, cấu hình ví dụ/Compose và cấu hình provider hiệu lực. Prompt, semantic-control, grounding, ToolArtifacts và business tools không thay đổi trong đợt này. Không xử lý riêng câu ordinal, địa chỉ, size hay “ngọt thanh”.

## 3–4. Nguyên nhân và hành vi cũ

Handoff production ghi Gemini 3.5 ReadTimeout sau 30s, Gemini 3.1 ReadTimeout sau khoảng 14.8s, tổng lượt khoảng 46s. Hai attempt đều thất bại: request_count/input_tokens/output_tokens/tool_round_count = 0. Không có proposal để semantic grounding xử lý, không có write nào bắt đầu. Đây là lỗi chờ provider, không phải lỗi ordinal, quota được suy đoán từ dashboard hay thất bại cập nhật giỏ.

Policy cũ có ceiling 30s/attempt, deadline 45s/round. Route đầu chiếm phần lớn deadline; key rotation còn có thể thử lại provider/model đang treo. Chỉ có cooldown quota/credential, chưa có transient health chung theo provider/model. Test cũ tái hiện 30 + 15s và customer retry đổi slot rồi chờ tiếp.

Baseline focused trước sửa: **36 passed, 1 warning in 0.93s**, log `/private/tmp/chatbot-resilience-before.log`. Đó là test xác nhận thiết kế cũ, không phải chứng minh thiết kế cũ đáp ứng trải nghiệm chat.

## 5. Scheduler mới

Tuần tự, inference-only. Mỗi `completion` có một monotonic round deadline và một ngân sách số lần gửi; format repair và context compaction dùng chung ngân sách đó, không có retry ẩn hoặc parallel hedging.

Defaults: 15s/route, 28s/round, tối đa 4 lần gửi/round. Clamp cho chat: route 1..18s, round 1..30s. Nhờ vậy `.env` cũ 30/45 cũng không giữ thiết kế chờ 45s. Không sửa `.env` thật.

Route candidates gồm provider, credential slot, model và compatibility mode được dùng khi gửi. Chỉ provider thuộc allowlist và có credential/model phù hợp mới là ứng viên.

Với `remaining = deadline - monotonic()`:

- Xét có route khác provider/model thực sự còn eligible và còn attempt không; key khác của cùng model không tự coi là fallback độc lập để chia thời gian.
- Route đầu có alternate thì cấp `min(route_ceiling, remaining / 2)`, dành nửa còn lại cho route có ích tiếp theo.
- Ở các attempt sau chỉ chia tiếp khi còn đủ cho hai response hữu ích (mốc 11s hoặc ceiling nhỏ hơn do cấu hình). Không chia 14s còn lại thành 7 + 7 khi primary đã treo 14s.
- Nếu không còn alternate có ích thì cấp `min(route_ceiling, remaining)`. Không reserve cho provider thiếu key, không được phép, bị cooldown, model không tồn tại hoặc ngân sách attempt đã hết.
- Khi còn đúng một attempt, provider khác eligible được ưu tiên để credential rotation, format/context repair không chiếm mất attempt dự phòng.
- Same-route format/context retry giữ nguyên route deadline đã được cấp. Không reset deadline khi lỗi hay đổi key.
- Dừng khi hết attempt/deadline hoặc candidates. Bỏ qua response trả về sau deadline; không dùng proposal muộn để thực thi business tool.

Hai model treo ở defaults: **14 + 14 = 28s**, hai actual sends, không đi qua hết key. Primary treo rồi secondary/emergency đáp trong 11s: **14 + 11 = 25s**, thành công. Primary khỏe mất 10 hoặc 11s: thành công lần đầu. Với raw runtime config cũ 30/45, effective clamp là 18/30: hai stall chia **15 + 15 = 30s**.

Custom requests dùng `urllib3.Timeout(total=assigned, connect=min(3, assigned), read=assigned)` để ngân sách connect/read được chia chung, thay vì cấp nguyên timeout riêng cho connect rồi lại read. Không thêm Session adapter retries. Groq SDK `max_retries=0`; OpenRouter `allow_fallback=False` trong guarded orchestration. Scheduler kiểm tra monotonic deadline sau response và không khởi động inference mới khi hết thời gian. Ngân sách này là chờ inference mỗi round, không bao gồm công cụ/DB hay toàn bộ hành trình nhiều round; kiểm chứng clock giả lập không thay thế phép đo transport thật.

## 6. Transient health / circuit breaker

Process-local map `(provider, model) -> (monotonic expiry, fixed failure category)`, chia sẻ qua mọi credential slot. Timeout/connection failure hoặc 5xx đặt cooldown default 30s, clamp 5..60s; không sleep, không Redis/DB, không ban vĩnh viễn.

Lượt sau bỏ route vừa treo, kể cả key khác, và dùng alternate còn khỏe. Nếu tất cả đang cooling thì fail rõ ngay, **0 actual sends** trong lượt đó. Hết hạn xóa entry và route trở lại thứ tự cấu hình. Success xóa transient health của route, bao gồm trường hợp một response đang bay thành công sau lỗi từ request khác. Restart process cũng xóa health. Không coi nhiều key là nhiều provider capacity độc lập.

## 7–9. Routing và cấu hình thực

Đọc an toàn từ container trước sửa:

| Thuộc tính | Giá trị |
|---|---|
| AI_AGENT_PROVIDER | gemini |
| Gemini credential count | 4, primary slots = 3 |
| OpenAI / Groq / OpenRouter / Cerebras configured | true / true / true / true |
| Allowed fallback names | gemini |
| Gemini models mỗi tier đang cấu hình | gemini-3.5-flash-lite, gemini-3.1-flash-lite |
| OpenAI model | gpt-4o-mini |
| Groq model | llama-3.3-70b-versatile |
| OpenRouter model | openai/gpt-4o-mini |
| Cerebras model | llama3.1-8b |
| Raw route / round timeout | 30 / 45 seconds |
| Provider attempt budget | 4 |

Có credential không đồng nghĩa provider được cho phép. Runtime này vẫn chỉ Gemini; không enable provider trả phí hay đổi allowlist.

Only Gemini: 3.5 -> 3.1 trong ngân sách; timeout không chuyển qua tất cả key của cùng model. Cả hai lỗi thì fail có category chính xác; lượt mới trong cooldown không lặp lại toàn bộ thời gian chờ. Khi hết cooldown, primary có thể được thử lại.

Nếu người dùng đã cấu hình emergency trong `AI_AGENT_FALLBACK_PROVIDERS` và có key hợp lệ: timeout/5xx ưu tiên provider khác, giữ nguyên messages/tools/canonical results. Không mở hidden fallback vì key tồn tại. Khi biến fallback vắng mặt, policy chỉ dùng preferred provider; ví dụ/Compose vẫn giữ allowlist explicit đã có `gemini,openai`, không thêm tên mới.

Multi-key support giữ nguyên: round-robin primary slots sau success, trailing slots vẫn usable; 401 và quota có thể dùng credential khác vì có bằng chứng loại lỗi liên quan credential. 404/400/unknown provider error chuyển model/provider phù hợp, không lặp cùng request bằng hết key.

## 10–12. Failure classes

| Bằng chứng | Category / xử lý |
|---|---|
| ReadTimeout / ConnectTimeout / connection failure không HTTP | network_timeout; ưu tiên alternate, cooldown provider+model ngắn |
| HTTP 5xx | provider_transient; cùng cơ chế transient, không báo rate limit |
| HTTP 429 / explicit quota, resource exhausted, TPM | rate_limit; Retry-After numeric/date, cooldown credential+model riêng; không sleep |
| HTTP 401 | invalid_credential; process-local invalid key, key khác vẫn usable |
| HTTP 403 | account_restricted; fence riêng trong turn |
| HTTP 404 / model unavailable | model_not_found; fence model trong turn |
| HTTP 400 | incompatible_request; cùng shape fenced; format downgrade một lần nếu có ngân sách, ưu tiên attempt emergency đã reserve |
| Context overflow / 413 context | context_length; compaction tối đa một lần, giữ canonical tool pairs/results |
| Lỗi provider khác / response rỗng | provider_error; không giả là quota, không loop cùng model qua key |

HTTP status đáng tin cậy 5xx/429 ưu tiên trước chữ trong body. Network exception không HTTP không bị nhầm vì message có chuỗi “429/quota”. Retry-After giữ clamp 1..300s hiện có, tách khỏi transient 5..60s. 402 quota/payment evidence giữ phân loại rate_limit hiện có; không suy luận từ màn hình AI Studio.

Metrics content-free giữ attempt/failure/provider counts, slot numbers, model names, fallback_count, retry_reason/category/type, failure latency. Thêm provider_wait_ms (mọi actual send, gồm success), round_wait_budget_ms, considered candidates, cooldown skips, network_timeout_count/provider_transient_count, selected provider/slot/model/mode, timeout được cấp và deadline còn lại. Skips không tăng outbound count. Compatibility retry có counter riêng; không nhận nhầm là successful provider/model/key failover. Không log key, credential hash, Authorization, prompts, tool args/results, opaque signatures hay raw private error body.

## 13–14. Write safety và continuation

Failover chỉ nằm trong `agent_provider_policy.completion` và wrappers; không tạo lại gateway, không restart orchestration, không gọi lại executor vì inference timeout. Messages hiện có được copy để gửi, không tái dựng từ prose.

Giữ nguyên `_continuation_tool_call`/`gemini_compat.inference_messages`: Gemini tiếp tục nhận opaque thought signatures như cũ; alternate provider được bỏ riêng Gemini `extra_content`. Assistant call IDs, tool_call_id, tool result content, canonical IDs và structured feedback không đổi; history gốc không bị sửa.

Gateway write authority/operation IDs, turn cache, deterministic ToolArtifacts/customer flow, durable processed-turn replay và same client_message_id giữ nguyên. Test ký tool -> write thành công -> Gemini final ReadTimeout -> OpenAI final thành công chứng minh write executor **đúng 1 lần**, same client_message_id trả lại cùng kết quả và không gửi inference/ghi thêm. Nếu mọi provider đều lỗi sau write, presentation từ business evidence vẫn hiển thị kết quả đã ghi; không nói rằng chưa có gì xảy ra. Before-tool timeout có 0 business read/write và phản hồi provider-unavailable rõ.

## 15–16. Files / environment

Production thay đổi:

- `src/common/agent_provider_policy.py`: sequential route scheduler, category precedence, transient health, deadline/attempt allocation, metrics.
- `src/common/groq_service.py`: shared connect/read transport timeout helper; giữ Gemini metadata và retry ownership.
- Repository root `.env.example`, `docker-compose.yml`: ai-service timeout defaults/comments và transient cooldown mới.

Tests: `test_provider_wait_budget.py`, `test_provider_resilience.py` (mới), `test_provider_outage_presentation.py`, `test_gemini_guarded_continuation.py`, `test_guarded_tool_gateway.py`, `test_numbered_category_choices.py`, `test_llm_tool_orchestrator.py` (isolate transient map trong fixture).

Docs: report này, link checkpoint trong `docs/BASELINE_113_REPAIR.md`.

Biến thay đổi defaults: `AI_AGENT_PROVIDER_TIMEOUT_SECONDS=15`, `AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS=28`. Biến mới: `AI_AGENT_PROVIDER_TRANSIENT_COOLDOWN_SECONDS=30`. `AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND=4` giữ nguyên, comments giải thích bao gồm mọi internal retry. Không sửa key, real `.env`, model IDs, provider preference hoặc runtime fallback allowlist.

## 17–18. Offline verification

Mọi Docker test dùng `--network none`. Provider tests còn block socket.connect/connect_ex/create_connection, Session.request và requests.post mặc định; chỉ serializer test thay post bằng scripted stub, không forward. Không dùng sleep hoặc fake clock chạy mạng thật. Business authorities dùng memory stubs.

Focused final: **145 passed, 0 failed, 1 warning in 1.76s**. Command từ repository root:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest \
    tests/test_provider_wait_budget.py tests/test_provider_resilience.py \
    tests/test_provider_outage_presentation.py tests/test_gemini_guarded_continuation.py \
    tests/test_guarded_tool_gateway.py tests/test_numbered_category_choices.py -q --tb=short
```

Semantic/business safety: **225 passed, 0 failed, 1 warning in 2.24s**. Cùng Docker command, chọn `tests/test_semantic_control.py tests/test_chatbot_semantic_regressions.py tests/test_turn_completion_evidence.py tests/test_reference_identity_repair.py`.

Full final: **2788 passed, 0 failed, 1 skipped, 2 warnings in 17.14s**, tăng 51 passed so với recorded baseline 2737. Command:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

Không thêm skip hoặc bỏ test để pass. Các assertion 30+15/key-hopping được thay bằng deadline/route/cooldown invariants cụ thể; wrapper tests kiểm tra total/connect/read thay vì scalar. Test pending-product retry giờ chứng minh immediate retry bị cooldown không ghi thêm, rồi fake clock hết cooldown vẫn giữ đúng product/defaults. Full run đầu phát hiện 4 assertion contract cũ; sau cập nhật đầy đủ, không còn lỗi. Skip integration theo cấu hình và hai deprecation warnings đã có.

Logs: `/private/tmp/chatbot-resilience-focused-final.log`, `/private/tmp/chatbot-resilience-safety.log`, `/private/tmp/chatbot-resilience-full-final.log`. AST parse và `git diff --check` kiểm tra riêng. Đây là transport/scripted protocol qualification offline, không xác minh NLU Gemini thật.

## 19–21. Build, runtime health và zero live calls

`docker compose build ai-service` thành công sau full offline verification; `docker compose up -d --no-deps ai-service` chỉ recreate `avengers_ai_service`. Không down stack, không remove-orphans và không recreate container Data Platform/phụ thuộc.

Health `/ai/health`: **HTTP 200**, `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, `redis_available=true`. Health chỉ đọc trạng thái, không gọi model.

Sau deploy, raw config vẫn 30/45 nhưng `wait_limits()` trong container trả **[18, 30]**; transient cooldown hiệu lực 30s, attempt budget 4, allowed fallback `gemini`, model order 3.5 -> 3.1, Gemini credential count 4. SHA-256 **2/2 file production** của đợt này khớp workspace/container, 0 mismatch. `.env` thật không sửa. AST parse 9 file Python thành công, `git diff --check` thành công.

Build/deploy logs: `/private/tmp/chatbot-resilience-build.log`, `/private/tmp/chatbot-resilience-deploy.log`. Không commit; giữ diff để review. **LIVE_PROVIDER_REQUESTS = 0** cho đợt thực hiện này: không qualification prompt, không dùng Gemini/OpenAI/Groq/OpenRouter/Cerebras key để test. Các HTTP sends trong test serializer hoàn toàn là scripted stub. Không chạy manual live plan bên dưới.

## 22. Manual live-test plan — do người dùng chạy sau review

Không cần bật provider mới hay sửa key. Dùng cuộc chat mới, yêu cầu xem menu/danh mục để có numbered product snapshot, rồi gửi đúng **“cho tôi món số 1 đi bạn”** một lần.

Expected healthy trace:

```text
model responds -> customer_actions
-> PRODUCT reference kind=ordinal, index=1
-> exact displayed canonical product
-> get_product_options / selection_staged
-> product options / pending configuration
```

Selection chưa tự thêm giỏ nếu chưa có required options/default authorization. Sau đó người dùng tự gửi lựa chọn Menu hợp lệ hoặc yêu cầu mặc định; kiểm tra đúng một dòng giỏ. Để kiểm tra HTTP idempotency, nếu dùng API client thì retry đúng request với cùng client_message_id; phải trả cùng kết quả, không thêm write.

Nếu 3.5 thật sự timeout: log request có timeout khoảng 15s với raw config hiện tại; 3.1 được khoảng 15s còn lại. Khi provider genuinely unavailable: bounded failover -> phản hồi rõ sau khoảng 30s + overhead, tool_round_count=0 trước proposal; không có write. Lượt mới ngay trong transient cooldown phải có cooldown skips và 0 outbound attempts nếu cả hai model đang cooling. Sau expiry 30s kể từ failure của từng model, route có thể trở lại. Không kỳ vọng một lần gửi lại buộc model đang outage hồi phục.

Nếu 3.1 hồi phục trong lúc 3.5 cooling: lượt mới bỏ 3.5, dùng 3.1; nếu response mất khoảng 10–11s vẫn được chấp nhận. Emergency provider chỉ xuất hiện khi chính người dùng cho phép trong fallback allowlist, đã có credential và không cooling.

Đọc trace bằng lệnh read-only:

```sh
docker logs --since 10m avengers_ai_service 2>&1 \
  | rg 'AgentProviderRequest|AgentProvider\]|SemanticAction|SemanticBatch|LLMToolTurn'
```

Xem provider_attempt_count/failure_count, timeout_seconds, round_deadline_remaining_ms, provider_routes_skipped_cooldown, models_tried, request_count và tool_round_count. Không chia sẻ key/full environment/prompt/body. Không gọi live test ở đợt triển khai này.
