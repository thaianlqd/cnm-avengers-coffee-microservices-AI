# Customer chatbot hardening — 2026-10-07

> Báo cáo này ghi kết quả lượt hardening trước. Lượt sửa tiếp theo đã xử lý regression discovery sau repair và cập nhật riêng container customer AI; xem [DISCOVERY_REPAIR_FIX.md](DISCOVERY_REPAIR_FIX.md). Số liệu qualification 40 request dưới đây là snapshot lịch sử, không có request Gemini mới trong lượt sửa tiếp theo.

**Trạng thái: đã sửa và kiểm tra phần server, chưa đạt tiêu chí ổn định với Gemini thật. Không kết luận đã sửa xong toàn bộ chatbot.** Đã dùng đúng **40/40 request** theo quyết định giữ trần của người dùng; không gọi thêm. Chỉ build `ai-service`, không restart container đang phục vụ khách. Không sửa Data Platform AI.

## Điểm xuất phát và phạm vi

HEAD `9a0d4b46fa989e2d1e0471efd493004f2f77f434`, branch `branch_thaian`. Khi bắt đầu lượt tiếp tục này, staged và unstaged đều sạch. Công việc chưa hoàn tất của lượt trước đã nằm trong HEAD; giữ nguyên và tiếp tục sửa, không reset/discard. Không tạo commit mới.

Chi tiết số liệu, toàn bộ 113 test lỗi và phân loại theo từng node ID ở [SEMANTIC_HARDENING_METRICS.json](SEMANTIC_HARDENING_METRICS.json). Audit đường production ở [SEMANTIC_HARDENING_AUDIT.md](SEMANTIC_HARDENING_AUDIT.md).

## Nguyên nhân và thiết kế hiện tại

1. Log triển khai ban đầu cho thấy `kich_co` bị mất trong khi `size` hoạt động, và địa điểm mới bị gán thành địa chỉ hồ sơ. HEAD đã chứa phần sửa ban đầu; lượt này đưa alias về một hàm chuẩn hóa dùng chung và chỉ công bố từ vựng canonical cho model.
2. Khi đọc tùy chọn để chọn sản phẩm, kết quả discovery có thể ghi đè lời hỏi tùy chọn; model tiếp tục đọc giỏ rỗng và quên sản phẩm đang chờ. Thêm dấu `selection_staged` do server tạo, hoàn tất bước hỏi tùy chọn bằng renderer và giữ pending owner.
3. Hướng dẫn bước tiếp theo bị đặt trong khối dữ liệu không tin cậy. Chuyển hướng dẫn từ trạng thái server sang prefix policy, không suy luận intent từ câu khách. Bỏ bản sao hướng dẫn trong payload để tránh gửi hai lần.
4. Chọn sản phẩm từng có thể bị hiểu là cho phép mặc định. Tách `option_intent=SELECT/CONFIGURE/DEFAULTS`; DEFAULTS cần `defaults_evidence` riêng, trích đúng lượt hiện tại. SELECT không được kèm tùy chọn đoán. Tùy chọn và mặc định vẫn lấy từ Menu.
5. `planned_discovery_reads` bị bỏ khi chuẩn hóa args, làm một lượt discovery cần nhiều provider call. Giữ trường này và render trực tiếp khi kế hoạch đọc đơn đã hoàn tất. Đọc để phục vụ một hành động chọn sản phẩm vẫn phải tiếp tục hành động đó.
6. Gemini thật đôi khi bỏ `tool`, trả envelope sai hoặc chuyển sang đọc giỏ không liên quan. Lỗi cấu trúc, namespace/kind sai, thiếu evidence và xung đột alias được phân loại `model_repair`; không biến thành câu hỏi khách chọn lại địa chỉ/món.
7. Ép gọi tool bằng `required` và named function đều nhận HTTP 400 với contract hiện tại, kể cả probe không có continuation. Chưa chứng minh được nguyên nhân cụ thể phía API; không quy kết cho thought signature. Gemini semantic repair dùng AUTO cùng kiểm tra bắt buộc phía server. Nếu model trả prose hoặc đọc không hoàn tất yêu cầu ở bước repair, dừng an toàn.
8. Generic “invalid argument” từng bị gán chắc chắn thành lỗi response format. Chỉ gán nhãn format khi provider thực sự đề cập format/MIME; thông báo chung giữ `unknown_incompatible_request`.
9. Giá trị `ít đá` và `Ít đá` trước đây bị coi là khác nhau. Khớp duy nhất theo nhãn của Menu với chuẩn hóa chữ/dấu; dùng lại nhãn canonical của Menu. Nhãn trùng sau chuẩn hóa hoặc giá trị ngoài Menu vẫn bị từ chối. Không thêm bộ từ khóa riêng cho câu người dùng.

Đường thực thi: ngôn ngữ khách → LLM semantic proposal → kiểm tra toàn batch → commitment/evidence hiện tại → grounding danh tính server → chuẩn hóa thuộc tính → schema của tool được chọn → policy → executor hiện có → artifacts/render/UI → replay và memory. HEAD đã có typed wrapper; thay đổi mới củng cố vocabulary, authorization, repair và presentation, không thêm classifier.

### Wire và grounding

Model chỉ thấy `customer_actions({actions:[{tool, commitment, args:{...}, evidence, ...}]})`. Union args là cấu trúc typed đóng; union không cấp quyền dùng field của tool khác. Gateway vẫn revalidate schema riêng của operation sau grounding. `args_json` chỉ còn tương thích caller cũ; không công bố cho model. Alias canonical hóa ở một boundary cho add, cart patch và các dòng order preview; xung đột không được âm thầm chọn một giá trị.

PRODUCT lấy từ danh sách/focus/pending canonical; pending có selection index ổn định. CART_LINE dùng snapshot đầu lượt. ORDER, VOUCHER và BRANCH giữ danh tính thuộc quyền người dùng/dữ liệu tool, không lấy ID đoán. `recent` chỉ áp dụng ORDER, `best` chỉ VOUCHER; kind/namespace không hợp lệ là lỗi proposal, còn nhiều đối tượng thật vẫn hỏi khách.

LOCATION literal mới, PROFILE_ADDRESS đã lưu và LOCATION_CANDIDATE từ provider là ba loại riêng. Literal không được biến thành saved address. Saved offer giữ kiểm tra lượt sau; map candidate giữ nguyên tọa độ provider. Compound delivery phải lưu fulfillment trước rồi mới resolve destination với `for_checkout=true`. `supplied_location=true` ngăn mở offer địa chỉ hồ sơ thay cho địa điểm mới.

Adapter địa chỉ hiện có vẫn yêu cầu địa chỉ giao đủ chi tiết. POI đi qua adapter thật và dừng ở bước hỏi số nhà/đường/phường/tỉnh nếu thiếu; không gọi geocoder để giả định POI là địa chỉ giao hoàn chỉnh. Test mới kiểm tra chính policy này bằng real adapter. Probe Gemini dùng geo authority giả lập, không chứng minh geocoding/inventory ngoài đời hoạt động.

### Repair, replay, presentation và diagnostics

Tối đa một quyết định sửa protocol bổ sung trong vòng tool hiện có. Giữ model/key đã trả response cho bước sửa; availability fallback vẫn giữ ngân sách attempt/time hiện có. Không xoay key để tìm ngẫu nhiên một semantic answer khác. Vòng sửa không được reset bằng một đọc giỏ không liên quan. Không thêm semantic call vô điều kiện vào lượt thành công.

Gateway giữ kết quả thao tác thành công theo operation/canonical target và không chạy lại target đó trong repair, kể cả args bị đổi. Durable turn replay, operation IDs, xử lý outcome unknown và cache đọc theo business revision vẫn giữ. Fence này có tính bảo thủ: yêu cầu nhiều phần riêng của cùng một target trong một lượt repair cần tiếp tục đánh giá; chưa có qualification live cho trường hợp đó.

Model protocol fault → internal repair/exhaustion; reference thật sự mơ hồ → customer clarification; business denial → policy hiện có; write không rõ outcome → reconciliation. Khi repair hết ngân sách, hiển thị giỏ đã commit nếu có, giữ trạng thái và không đổ lỗi cho câu khách hay hiển thị nhầm flow địa chỉ. Bước lưu payment đã đủ dữ liệu sẽ trả lời ngay từ server, không cần một call chỉ để diễn đạt xác nhận.

`SemanticAction`/`SemanticBatch` ghi operation, access, commitment, namespace/kind, tên arg, evidence có/khớp hay không, nguồn grounding, decision, phần đã chạy/còn lại và repair count. Không ghi evidence thô, địa chỉ, credential hoặc thought signature. Evidence substring là neo thời gian, không phải một bộ NLU độc lập chứng minh ý nghĩa câu khách.

## Files và authority

Source thay đổi: `checkout_contract.py`, `customer_flow_presentation.py`, `llm_tool_orchestrator.py`, `semantic_control.py`, `tool_artifacts.py`, `tool_policy.py`, `agent_provider_policy.py`, `gemini_compat.py`, `groq_service.py`.

Tests thay đổi: `test_semantic_control.py`, `test_chatbot_semantic_regressions.py`, `test_gemini_guarded_continuation.py`. Ba tài liệu audit/report/metrics được thêm trong `docs`.

Không sửa business executors: Menu/price/stock, cart SQL/API, voucher eligibility, wallet/payment authority, profile service, branch inventory, geo provider, order service/checkout submission, RAG/review tools. Không sửa các service khác, `.env` hoặc Data Platform. Gemini ưu tiên vẫn **3.5 Flash Lite → 3.1 Flash Lite**; không thay bằng model ngoài yêu cầu.

## Verification

Chạy từ root repo; `IMAGE=cnm-avengers-coffee-microservices-ai-ai-service:latest`.

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -w /repo/avengers-coffee-system/services/ai-service "$IMAGE" \
  python -m pytest tests/test_semantic_control.py tests/test_chatbot_semantic_regressions.py \
  tests/test_gemini_guarded_continuation.py::test_semantic_repair_uses_auto_same_key_and_signed_history -q --tb=short
```

**176 passed, 0 failed, 1 warning, 1.75s.** Bao gồm architecture probes nhiều domain, aliases, defaults, pending index/quantity, partial write/replay, one-repair cap, real signed serializer/AUTO/same-key, real delivery precision gate, và hành trình scripted từ discovery/select/configure → cart/voucher → delivery/location → payment → summary → later confirmation → fake order creation. Scripted language và authorities cô lập không thay thế qualification LLM thật.

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service "$IMAGE" \
  python -m pytest tests -q --tb=short
```

Full current: **2,531 passed, 113 failed, 1 skipped, 2 warnings, 17.85s.** Cùng command trên snapshot HEAD ban đầu: **2,510 passed, 113 failed, 1 skipped, 2 warnings, 20.23s.** Đối chiếu node IDs: **0 lỗi test mới, 0 lỗi nền được giải quyết**. Không xfail/xóa test để đổi kết quả.

Baseline triage: **B=22**, expectation cũ về exact tool counts/format retry/selected-options continuation/snapshot; **D=3**, fixture chưa cung cấp cart/inventory authority hiện tại; **C=88**, lỗi có trước trong compatibility/business paths không đổi, vẫn cần theo dõi. C không có nghĩa là đã chứng minh vô hại hoặc không liên quan khách hàng. Triage chi tiết giữ từng node ID; không lấy số baseline làm lý do bỏ qua lỗi live.

Điểm safety đã xem riêng: 12 custom-option tests dừng cùng shared setup, chưa tới follow-up assertions; 27 voucher/profile tests dùng legacy runtime nên không chứng minh production semantic lane. Các test semantic độc lập kiểm tra no-default-on-selection, defaults riêng, lượng pending, voucher hiện tại, profile offer/later-turn/rejection, branch inventory deny, fresh fingerprint/expiry, same-turn confirm deny và idempotent order confirmation. Branch fixture cũ bỏ qua cart inventory authority; guard thật từ chối, không nới policy để làm test xanh. Nhiều legacy customer-flow assertions vẫn chưa được sửa và báo cáo này không kết luận chúng đã ổn.

Syntax: `python -m compileall -q src/agents src/common` và ba test files thay đổi trong container, exit 0. `git diff --check`, exit 0. `docker compose build ai-service`, exit 0, image built; không chạy `up`/restart. Logs giữ tại `/private/tmp/chatbot-hardening-{baseline,all-final,focused-final,build}.log`.

## Gemini thật: kết quả và giới hạn

Runner: `python3 /private/tmp/run-chatbot-real-probe.py`, probe cô lập `/private/tmp/chatbot-real-probe.py`. Credential chỉ truyền trong process environment, không in/ghi ra file; business HTTP/SQL và order submission thật bị chặn. Ledger lưu mỗi HTTP attempt trước khi gửi tại `/private/tmp/chatbot-live-qualification/requests.json`, có hard cap 40; bản số liệu không chứa credential được đính kèm trong metrics.

**40 request thực tế: 34 HTTP 200, 6 HTTP 400; 38 gọi Gemini 3.5 Flash Lite, 2 gọi Gemini 3.1 Flash Lite theo availability fallback.** 30 request đầu phục vụ chẩn đoán/requalification trong lúc sửa; 10 request cuối dùng cho qualification pair rồi minimum requalification. Các probe trước khi nhận yêu cầu tiếp tục này là lượt chẩn đoán lịch sử riêng, không được trình bày thành kết quả của bản hiện tại.

Đã thử discovery cà phê, chọn tên sản phẩm, cấu hình size/đá/ngọt, chuỗi discovery→selection→configuration và các request ép tool để chẩn đoán 400. Một option turn trong quá trình phát triển (request 21) thành công bằng một call sau khi chuyển trusted hint; điều này không đủ chứng minh ổn định.

| Qualification cuối | Provider calls | Kết quả |
|---|---:|---|
| Cấu hình, fresh session 1, request 31–34 | 4 | Thêm đúng trong một customer turn; 1 protocol repair và 2 business-option corrections |
| Cùng câu, fresh session 2, request 35–39 | 5 | Không thêm; model thiếu tool rồi lệch sang đọc giỏ/catalog; dừng sweep |
| Minimum requalification sau sửa, request 40 | 1 | HTTP 200 nhưng không có tool action; loop chưa hoàn tất thao tác và không còn budget để tiếp tục |

Pair cuối: **first-provider-attempt success 0/2**, hoàn tất trong một customer turn **1/2**; cả hai có protocol repair. Minimum requalification: **0/1 hoàn tất**, không được suy diễn là provider HTTP failure. Không có customer message được gửi lặp trong từng case, nhưng có case thất bại nên **chưa đạt `customer_repeat_required=0`**. Các câu giống nhau ở hai phiên mới là repeatability probe, không phải khách lặp trong cùng phiên.

Chưa hoàn thành 5 nhóm × ít nhất 2 fresh sessions, matrix 20–30 lượt hay hành trình full live qua voucher/payment/branch/summary/order. Development diagnostics và failed cases được giữ, không chỉ chọn case thành công. Last bounded-repair/context optimizations có test offline; không còn ngân sách để xác minh live toàn bộ bản cuối.

Provider báo tổng **91,559 input tokens / 3,458 output tokens** cho HTTP thành công; token usage của 400 không được báo nên không coi đây là tổng billing. Median HTTP latency **1,600.5ms**, tổng thời gian HTTP **75,188ms**. Pair thất bại/thành công cần khoảng **7.76s/6.24s** mỗi turn. Không có matched pre/post live cohort để kết luận giảm latency/token thực tế.

Đo offline cùng synthetic state, tổng ký tự system + context + schema:

| State | HEAD baseline | Bản cuối | Chênh lệch |
|---|---:|---:|---:|
| Discovery | 10,359 | 12,038 | +16.2% |
| Pending options | 11,677 | 13,895 | +19.0% |
| Checkout ready | 13,184 | 15,142 | +14.9% |

Giữ state-only capability filtering, compact context/history, read cache, một wrapper và không thêm classifier/call vô điều kiện. Tuy vậy contract/policy rõ hơn làm prompt lớn hơn; không tuyên bố tiết kiệm token tổng thể. Character count không phải tokenizer count. Read đơn có kế hoạch và selected options/payment được render trực tiếp; giảm call ở các bước này được kiểm tra bằng fake-provider tests.

## Điều còn thiếu và hành trình human verification

Chưa đạt reliability live; model có thể bỏ discriminator hoặc trả prose dù khách yêu cầu thao tác. AUTO repair xử lý được một số lỗi nhưng không đảm bảo model tuân thủ; nested union schema/forced-tool compatibility cần tiếp tục nghiên cứu với một ngân sách live được cấp ở lượt khác. 113 baseline failures còn nguyên, actual geo/service integration chưa qualification, và successful-target fence cần thêm đánh giá cho nhiều phần của cùng sản phẩm.

Khi tiếp tục kiểm tra trên môi trường review, dùng một phiên mới và không gửi lại câu rõ nghĩa để làm nó tình cờ chạy:

1. “hi bên bạn có bán cà phê sữa không” → đúng danh sách và ID từ Menu.
2. “cho tôi cà phê sữa đá đi” → pending product, hỏi required options, chưa thêm/default.
3. “size lớn, ít đá và ít ngọt” → một customer turn, đúng nhãn Menu/giá/quantity, không paid topping tự thêm.
4. “giao cho tôi về chợ bà chiểu đi” → lưu GIAO_TAN_NOI trước, LOCATION/POI, chỉ hỏi chi tiết địa chỉ giao còn thiếu.
5. Cung cấp số nhà/đường/phường/tỉnh → actual geo/provider candidate, branch inventory/delivery validation; không tự đổi location sang profile.
6. Hoàn tất giỏ → voucher offer; chọn mã hoặc nói bỏ qua ở lượt riêng.
7. Chọn tiền mặt hoặc phương thức hiện có → payment authority lưu lựa chọn.
8. Yêu cầu xem tóm tắt → summary/fingerprint/action mới; chưa tạo đơn.
9. Hỏi thêm một câu về tổng/địa chỉ → đọc, không confirm; lựa chọn đã lưu giữ nguyên.
10. Xác nhận rõ ở lượt sau → đúng một order submission, replay cùng turn ID không tạo lại.
11. Phiên riêng: chọn hai món; món 1 mặc định, món 2 topping/ngọt riêng → không trộn options/quantity; kiểm tra correction và negation.

Không triển khai bản này như một bản đã đạt acceptance. Code, tests và build hiện sẵn để review; phần qualification còn thiếu được ghi rõ thay vì tuyên bố thành công từ một vài câu.
