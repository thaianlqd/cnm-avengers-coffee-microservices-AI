# PLAN V4 — Stabilize AI Chat Cart, Context & Transaction Safety

## 0. Mục tiêu

Nâng Chat AI Avengers Coffee từ mô hình “LLM + tool + AI-owned session cart” sang mô hình:

- Order Service là **single source of truth** cho cart.
- AI chỉ giữ **conversation state / working state / references**, không giữ writable business cart.
- Mọi cart mutation phải **exactly-once/idempotent**.
- Read-only intent tuyệt đối không được mutate cart.
- Giá, tồn kho, voucher, quote, quyền sửa/hủy/chốt đơn do backend quyết định.
- Conversation dài/reload không làm mất món đã chọn hoặc checkout preferences.
- Refactor dần sang LangGraph/stateful workflow, không đập bỏ code hiện tại.
- Giữ tương thích frontend/API hiện tại nếu có thể; thay đổi contract phải có migration rõ ràng.

## 1. Bug cần giải quyết trước tiên

Reproduce chính xác case:

1. Bot hiển thị danh sách nước + bánh có đánh số.
2. User: “thêm nước số 2 với bánh số 1”.
3. Bot thêm đúng 2 món, quantity = 1 mỗi món.
4. Bot hỏi có muốn thêm gì nữa không.
5. User: “xem các sản phẩm về matcha”.
6. Bot chỉ được search/show Matcha.
7. Cart phải vẫn y nguyên; bánh cũ **không được tăng từ 1 lên 2**.
8. User: “giỏ tôi có gì?” → chat phải đọc đúng cart backend, giống web cart.
9. Tiếp tục chat 15–30 lượt → cart vẫn đúng, không quên/mất/nhân món.

Các triệu chứng cần truy nguyên:
- tool `add_to_cart` bị gọi lại ở lượt read-only;
- selection index cũ bị reuse sau khi active list đã đổi;
- `pending_products`/working state bị clear hoặc overwrite;
- duplicate tool call không có idempotency;
- AI cart mirror và Order Service cart lệch nhau;
- model dựa vào message history để “nhớ cart”.

---

# 2. Nguyên tắc kiến trúc bắt buộc

## 2.1 Business state vs conversation state

Tách 3 loại state:

### A. Business state — thuộc backend
- cart
- cart lines
- quantity
- authoritative price
- quote
- voucher result
- order
- payment status
- availability/capability

Owner: Order Service / Menu / Inventory / Identity.

### B. Conversation working state — thuộc AI
- conversation_id
- focus_entity
- active_list_context
- pending_products
- checkout preferences/draft
- pending_action
- resume_task
- last_order_id
- references

### C. Message history — chỉ để hiểu ngôn ngữ
- recent turns
- summary của turns cũ nếu cần
- không dùng history làm source of truth cho cart.

**Invariant:** AI không được “nhớ cart bằng lời”. Khi cần cart thật phải đọc Order Service.

## 2.2 Single source of truth

- Logged-in customer cart: Order Service là writer duy nhất.
- AI `cart_manager.py` không được increment/decrement item độc lập cho customer đã xác thực.
- AI có thể cache/mirror snapshot để render prompt, nhưng snapshot là **read-only** và luôn có `cart_version`.
- “New conversation” không được clear cart.
- Cart chỉ clear sau khi Order Service xác nhận order creation thành công.

## 2.3 Server authoritative

LLM/tool input không được quyết định:
- unit_price
- line_total
- subtotal/final_total
- stock availability
- voucher discount
- order capability
- payment status

LLM chỉ truyền stable identifiers + lựa chọn user:
- product_id
- variant/option IDs hoặc canonical option values
- quantity
- note
- cart_id/version nếu contract yêu cầu.

---

# 3. Phase 0 — Audit local workspace trước khi sửa

**Quan trọng:** local workspace hiện có file/chỉnh sửa chưa chắc đã nằm trên `main`, ví dụ `src/agents/order_flow_graph.py`, `agent_service.py`, `tier1.py`, `inventory_validation.py`.

Codex phải làm trước:

1. Chạy `git status`, `git diff --stat`, `git diff`.
2. Không `reset --hard`, không checkout đè file modified/untracked.
3. Xác định code path runtime hiện tại:
   - endpoint chat nào gọi `run_order_flow()` / graph;
   - khi `_GRAPH is None` fallback về `_run_agent_impl`;
   - đường nào đang được bật bằng feature flag/env.
4. Vẽ call path thực tế:
   `main.py/API -> order_flow_graph.py -> agent_service.py/function calling -> cart_tools.py -> Order Service`.
5. Tìm toàn bộ writer của cart:
   - `cart_manager.add_item/remove_item/clear_cart`
   - `execute_add_to_cart/remove_from_cart`
   - frontend CartContext/API
   - Order Service cart controller/service/repository.
6. Tìm toàn bộ nơi resolve “số 1/số 2”, `pending_products`, `branch_candidates`, voucher candidates.
7. Tìm toàn bộ retry/tool-loop cache hiện tại.
8. Không bắt đầu LangGraph refactor lớn trước khi reproduce bug và có regression tests.

Deliverable Phase 0:
- note ngắn `CURRENT_CHAT_CART_FLOW.md` hoặc comment trong PR mô tả source of truth hiện tại, write paths, read paths, duplicate-risk points.

---

# 4. Phase 1 — Viết regression tests cho bug thật trước

Bổ sung test trước khi sửa.

Target:
- `ai-service/tests/test_chat_flow_safety.py`
- test graph/router nếu đã có
- Order Service cart tests
- integration/e2e script hiện tại.

Bắt buộc có các case:

### TC-A — Exact bug “browse Matcha làm bánh x2”
- active list A: nước + bánh.
- user chọn 2 món.
- assert cart backend: 2 lines hoặc đúng normalized lines, qty=1.
- turn sau: user search Matcha.
- assert mutation count = 0.
- assert cart fingerprint/version không đổi.
- assert cake qty vẫn = 1.

### TC-B — Repeated tool call same logical operation
- simulate agent phát `add_to_cart` 2 lần với cùng `operation_id`.
- Order Service chỉ mutate 1 lần.
- lần 2 trả same result / `already_processed`.

### TC-C — Client retry
- cùng `client_message_id` gửi lại.
- response giống nhau.
- cart không đổi lần 2.

### TC-D — Long conversation
- add 2 items.
- 20 read-only turns: review/menu/branch/FAQ/search.
- reload/reload memory.
- `get_cart` cuối cùng khớp backend.

### TC-E — List context replacement
- show list A.
- user chọn A#2.
- show Matcha list B.
- “số 1” sau đó phải resolve B#1, không A#1.
- nếu câu mơ hồ và không có active list phù hợp → hỏi lại, không mutate.

### TC-F — Different namespaces
- voucher “mã số 2” không resolve thành product #2.
- branch “cửa hàng số 2” không resolve thành product #2.
- order “đơn số 2” không resolve thành product #2.

### TC-G — Same product, different options
- cùng product + size nhưng khác đường/topping => separate lines.
- exact same option signature => quantity may merge according to Order Service rule.

Không chấp nhận fix nếu tests chỉ mock `cart_manager` mà không kiểm tra Order Service mutation.

---

# 5. Phase 2 — Hoàn tất Single Source of Truth cho cart

Repo đã có hướng partial sync (`sync_authoritative_cart`, `replace_items_from_order_cart`), nhưng phải hoàn tất migration.

## 5.1 Order Service contract

Codex phải inspect endpoint/model hiện hữu, tận dụng contract hiện tại; không tạo API trùng vô ích.

Contract đích tối thiểu:

- `GET /cart/:userId`
  - trả authoritative cart snapshot
  - `cart_id`
  - `cart_version`
  - lines có `line_id`
  - item_count
  - authoritative totals nếu có.

- `POST /cart` hoặc endpoint canonical add-line
  - server tự resolve/validate price
  - nhận idempotency key / operation_id
  - trả full cart snapshot sau mutation.

- update quantity theo `line_id`.
- remove theo `line_id` là ưu tiên.
  - legacy remove bằng `product_id + size` chỉ giữ adapter compatibility, không dùng làm canonical vì không đủ phân biệt toppings/options.

- `POST /cart/:userId/quote`
  - backend authoritative quote.

## 5.2 `cart_manager.py`

Refactor role:

Giữ:
- branch/fulfillment draft nếu chưa chuyển owner;
- pending_products;
- active list/reference state;
- pending_action;
- checkout prefs;
- cached cart metadata (`cart_id`, `cart_version`) nếu cần;
- read-only mirror cho prompt/debug.

Không còn là writer của customer cart:
- không increment customer item độc lập;
- không tính `total_price` từ snapshot cũ rồi coi là authoritative;
- `add_item/remove_item` với authenticated customer phải bị loại khỏi runtime write path hoặc rename rõ là guest/local legacy path.

`replace_items_from_order_cart()` phải là REPLACE snapshot, tuyệt đối không additive merge.

## 5.3 AI cart tools

`execute_get_cart()`:
- authenticated customer: Order Service bắt buộc là primary.
- nếu Order Service lỗi, không được silently trả stale AI cart như dữ liệu chắc chắn.
- trả status `unavailable/stale` rõ ràng; có thể kèm cached snapshot marked stale cho UX nhưng bot phải nói chưa đồng bộ được.

`execute_add_to_cart()`:
- không mutate AI cart trước Order Service.
- gọi Order Service.
- sau success, GET/refetch full cart authoritative.
- update read-only mirror.
- rồi mới trả “đã thêm”.

`execute_remove_from_cart()` tương tự.

**Không dùng local fallback để ghi cart của authenticated customer khi Order Service down.**

Guest flow nếu cần:
- tách adapter riêng `GuestDraftCart`, không reuse semantics của customer cart;
- chưa cần triển khai nếu scope hiện tại chỉ logged-in checkout.

---

# 6. Phase 3 — Exactly-once mutation bằng operation_id / idempotency

`client_message_id` hiện chỉ dedupe request-level; cần thêm dedupe **business mutation**.

## 6.1 Operation identity

Mỗi logical mutation có stable operation id, ví dụ:
`conversation_id + client_message_id + action_index/type`

Không tạo UUID mới mỗi lần model retry cùng logical action.

Ví dụ:
- turn T muốn add 2 món => 2 operation:
  - `T:add:0`
  - `T:add:1`

Retry cùng tool call phải dùng lại đúng operation id.

## 6.2 Order Service idempotency

Ưu tiên persistence trong DB:
- bảng `cart_mutation_operation` hoặc reuse infrastructure hiện có.
- fields tối thiểu:
  - operation_id unique
  - user_id/cart_id
  - operation_type
  - request_hash
  - result snapshot/result ref
  - created_at.

Rule:
- same operation_id + same payload -> return stored result, no second mutation.
- same operation_id + different payload -> conflict 409.

Có thể truyền qua:
- `X-Idempotency-Key`
hoặc field `operation_id`.
Chọn một contract thống nhất.

## 6.3 Tool layer

Mutation tool bắt buộc có operation context từ orchestrator, không để LLM tự invent.
LLM schema không cần expose operation_id nếu executor có thể inject server-side.

Áp dụng ít nhất:
- add cart
- set quantity
- remove line
- apply/remove voucher nếu mutation
- create order
- update/cancel order.

---

# 7. Phase 4 — Active List Context / Reference Resolver

Giải quyết triệt để “số 1/số 2” bị dùng nhầm.

Structured state:

```json
{
  "active_list": {
    "list_id": "list-uuid",
    "kind": "PRODUCT|VOUCHER|BRANCH|ORDER",
    "source_message_id": "msg-id",
    "items": [
      {"index": 1, "entity_id": "...", "entity_type": "PRODUCT"},
      {"index": 2, "entity_id": "...", "entity_type": "PRODUCT"}
    ]
  }
}
```

Rules:
- Mỗi lần bot thực sự hiển thị một numbered list mới, set/replace active list tương ứng.
- “nước số 2” resolve trong product-group list được hiển thị gần nhất.
- “mã số 2” chỉ resolve `VOUCHER`.
- “cửa hàng số 2” chỉ resolve `BRANCH`.
- Không resolve index từ raw message history khi structured list context tồn tại.
- Khi context đã đổi sang Matcha list B, index cũ từ list A không còn default.
- Có thể giữ `recent_lists` cho explicit reference “danh sách lúc nãy”, nhưng default resolver chỉ dùng active compatible list.
- `pending_products` là selection workflow khác với displayed list; browse/search read-only không được clear hoặc re-add pending products.
- Sau khi pending item đã added thành công, mark exact pending item complete bằng stable product/selection id, không chỉ fuzzy product name nếu có thể.

---

# 8. Phase 5 — Intent-level Mutation Guard

Prompt instruction là chưa đủ. Enforcement phải bằng code.

Mỗi turn tạo `TurnIntent/TurnPlan` có:
- intents[]
- entities
- references
- confirmation
- requested_changes
- `mutation_policy`

Tối thiểu:

### READ_ONLY
Ví dụ:
- search/browse product
- product detail/options/price inquiry
- review
- branch info
- FAQ/RAG
- get cart
- get order status/history

Allowed tools:
- search/get/read tools.

Blocked:
- add/remove cart
- voucher mutation
- checkout/create/update/cancel order.

### CART_MUTATION
Chỉ khi user có explicit purchase/change verb hoặc deterministic UI action:
- thêm
- lấy
- mua
- chọn món để mua
- bỏ/xóa/đổi số lượng.

### TRANSACTION_MUTATION
- confirm checkout
- update/cancel order
- payment-related writes.

Executor phải check policy trước khi chạy tool. Nếu LLM phát write tool trong READ_ONLY turn:
- block tool;
- log `blocked_mutation`;
- continue/generate safe reply;
- cart_version phải không đổi.

Case “xem các sản phẩm matcha” => READ_ONLY, mutation count bắt buộc 0.

---

# 9. Phase 6 — Structured Conversation State V4

Dùng Pydantic/TypedDict schema versioned; nếu `order_flow_graph.py` đã có state thì mở rộng nó, không tạo state system thứ hai.

Đề xuất:

```json
{
  "schema_version": 4,
  "conversation_id": "...",
  "state_version": 1,
  "mode": "SHOPPING",
  "draft": {
    "cart_id": "...",
    "cart_version": 12,
    "fulfillment": null,
    "outlet": null,
    "delivery_address_snapshot": null,
    "payment_method": null,
    "voucher_code": null,
    "quote_id": null
  },
  "active_list": null,
  "focus_entity": null,
  "pending_products": [],
  "pending_action": null,
  "resume_task": null,
  "last_order_id": null
}
```

Không lưu authoritative cart lines như một nguồn ghi trong state. Nếu cache snapshot để prompt:
- đặt tên `cart_snapshot_cache`
- có `cart_version`
- marked non-authoritative.

Memory:
- recent messages cho language context;
- structured state cho durable facts;
- optional summary cho old turns;
- không cần nhét 100 messages vào mỗi model call.

`conversation_memory.py`:
- preserve backward-compatible DB rows.
- migration theo `schema_version`.
- `client_message_id` request dedupe giữ lại.
- không clear cart khi tạo conversation mới.

---

# 10. Phase 7 — Backend authoritative price / options / stock / quote

Hiện tool schema vẫn nhận `unit_price`; phải loại khỏi trust boundary.

## 10.1 Add-cart input đích

AI gửi:
- product_id
- quantity
- option IDs/canonical options
- note
- outlet/cart context nếu cần.

Không gửi authoritative price.

Order/Menu/Inventory side:
1. validate product active.
2. validate option combination.
3. compute base price + surcharges.
4. validate quantity.
5. validate availability if outlet known.
6. mutate cart.
7. return line with server price.

Nếu outlet chưa biết:
- cart có thể nhận product draft theo policy, nhưng stock state là UNKNOWN/UNVERIFIED.
- checkout/quote bắt buộc revalidate outlet-specific stock.

## 10.2 Quote

`quote_cart` trả:
- quote_id
- quote_version
- cart_id/cart_version
- lines + server unit/line prices
- subtotal
- discount
- shipping fee/status
- final_total
- outlet/fulfillment/address snapshot refs
- expires_at.

Không tính total trong AI nếu quote endpoint có sẵn.
AI chỉ format response từ quote.

---

# 11. Phase 8 — General `pending_action / action_id / version`

Repo đã có checkout action/fingerprint; generalize thành transaction action.

Schema:

```json
{
  "action_id": "...",
  "action_type": "CREATE_ORDER|UPDATE_ORDER|CANCEL_ORDER|USE_ADDRESS",
  "target_id": "...",
  "cart_version": 12,
  "quote_id": "...",
  "resource_version": 7,
  "expires_at": "...",
  "status": "AWAITING_CONFIRMATION"
}
```

Rules:
- user “ừ/ok/đồng ý” chỉ confirm action đang active và compatible.
- nếu user đồng thời sửa điều gì: process modification trước, invalidate action cũ.
- cart/price/outlet/payment/fulfillment/address thay đổi => checkout action stale.
- confirm endpoint/tool ưu tiên nhận `action_id`, không nhận boolean `is_confirmed=true` làm authority.
- UI confirm button và chat “đồng ý” gọi cùng application service.
- trước write: revalidate ownership, version, quote TTL, stock, capabilities.
- outcome unknown => query operation status, không replay create order.

---

# 12. Phase 9 — Centralize business capabilities

Order Service trả `available_actions`, ví dụ:

```json
{
  "order_id": "...",
  "version": 5,
  "status": "CONFIRMED",
  "available_actions": {
    "can_edit": false,
    "can_cancel": true,
    "can_pay": false
  },
  "reasons": {
    "edit": "Order is already confirmed"
  }
}
```

AI không hardcode lại state rules.

Áp dụng:
- edit order
- cancel
- checkout eligibility
- payment method availability nếu backend có capability registry.

Remove/phase-out prompt logic kiểu “nếu status X thì được hủy” khi backend đã trả capability.

---

# 13. Phase 10 — Refactor `order_flow_graph.py` theo deterministic write path

Chỉ làm sau khi Phase 1–9 ổn.

Không rewrite toàn bộ agent ngay.

Graph đích:

`LOAD_STATE`
→ `PARSE_TURN`
→ `RESOLVE_REFERENCES`
→ `POLICY_GATE`
→ route:

- `READ_PRODUCT`
- `READ_KNOWLEDGE`
- `READ_CART`
- `CART_MUTATION`
- `CHECKOUT_PREPARE`
- `AWAIT_CONFIRMATION`
- `CONFIRM_ACTION`
- `READ_ORDER`
- `ORDER_MUTATION`
- `CLARIFY`

→ `REPLY`
→ `SAVE_STATE`.

Nguyên tắc:
- write nodes deterministic.
- LLM có thể parse/rank/rephrase, nhưng không bypass policy gate.
- one mutation gate.
- graph state là structured schema duy nhất.
- `agent_service.py` giảm dần vai trò God Orchestrator.
- fallback legacy agent chỉ read-only hoặc feature-flagged; không cho hai orchestrator cùng quyền write trên cùng conversation.

Feature flag gợi ý:
- `AI_ORDER_GRAPH_V4=true`
- rollout per conversation; một conversation chỉ thuộc một orchestrator write path.

---

# 14. Phase 11 — Frontend synchronization

Sau mỗi mutation:
- backend response trả authoritative cart snapshot + version.
- Chat UI cập nhật badge/cart state từ payload hoặc refetch.
- Web CartContext cũng dùng cùng Order Service.
- không maintain independent chat cart count.

Khi Chat UI render “Giỏ hàng hiện tại”:
- dùng structured backend payload.
- không parse text bot để update cart.

“Làm mới chat”:
- tạo conversation_id mới.
- giữ cart backend.
- reset only conversation working state theo policy.

---

# 15. Observability bắt buộc

Mỗi turn log structured fields:
- turn_id
- conversation_id
- client_message_id
- user/session hash
- intent category
- mutation_allowed
- active_list_id/kind
- tool name
- operation_id
- cart_version_before
- cart_version_after
- pending_action_id
- result status
- latency

Không log token, secret, payment credential, full PII/address nếu không cần.

Thêm invariant log/error:
- READ_ONLY mà cart_version đổi => ERROR.
- same operation_id tạo cart_version tăng lần 2 => ERROR.
- response “đã thêm” nhưng không có successful mutation result => ERROR.

---

# 16. Acceptance criteria

Chỉ coi V4 PASS khi:

1. Exact bug Matcha không còn: browse Matcha không tăng bánh.
2. 20+ read-only turns không đổi cart.
3. “giỏ có gì?” luôn khớp Order Service/Web cart.
4. Same `client_message_id` không mutate lần 2.
5. Same `operation_id` không mutate lần 2 dù tool executor chạy lại.
6. Search/review/FAQ/branch inquiry có 0 cart mutation.
7. Product/list/voucher/branch/order numeric references không cross-resolve.
8. Reload/new chat không làm mất cart.
9. Same product khác options không merge sai.
10. Price chat/cart/quote/order giống nhau và do backend tính.
11. Stale checkout action bị reject sau cart version thay đổi.
12. Double confirm chỉ tạo 1 order.
13. Backend unavailable không được fallback sang local writable authenticated cart.
14. Test suite hiện có vẫn pass.
15. Docker build `ai-service` + `order-service` pass.
16. `git diff --check` pass.
17. Không có traceback mới trong logs khi chạy E2E.

---

# 17. Thứ tự triển khai khuyến nghị

Không làm tất cả trong một mega commit.

### Commit/PR 1 — Regression + instrumentation
- exact bug tests
- mutation logs
- baseline.

### Commit/PR 2 — Authoritative cart
- Order Service canonical cart
- AI read-only mirror
- get/add/remove refetch.

### Commit/PR 3 — Mutation idempotency
- operation_id
- Order Service dedupe persistence
- retry tests.

### Commit/PR 4 — Reference/list context + mutation guard
- active_list
- typed resolver
- READ_ONLY write blocking.

### Commit/PR 5 — Structured state/memory
- V4 schema
- migration
- long-conversation tests.

### Commit/PR 6 — Authoritative price/stock/quote
- remove unit_price trust
- backend quote
- option/availability validation.

### Commit/PR 7 — Pending action/version + capabilities
- general action confirmation
- stale/retry behavior
- centralized available_actions.

### Commit/PR 8 — Graph cleanup
- migrate deterministic nodes into `order_flow_graph.py`
- reduce legacy agent write permissions
- feature flag rollout.

### Commit/PR 9 — UI sync + full E2E
- authoritative cart payload
- exact user transcript
- Docker/test verification.

---

# 18. Các điều Codex KHÔNG được làm

- Không fix bằng cách chỉ tăng chat history/prompt “hãy nhớ giỏ”.
- Không dùng Redis làm source of truth cart. Redis chỉ cache/lock nếu cần.
- Không giữ hai writable cart.
- Không cho LLM truyền giá có quyền quyết định.
- Không dùng fuzzy product name làm identity cho cart line nếu đã có line_id/product_id/options.
- Không retry mutation không idempotent.
- Không để read-only turn gọi write tool chỉ vì model đề xuất.
- Không clear cart khi user mở conversation mới.
- Không rewrite toàn bộ project cùng lúc.
- Không xóa hoặc ghi đè local uncommitted work.
- Không bật VNPay/QR checkout qua chat nếu payment flow chưa có contract an toàn tương ứng.

---

# 19. Prompt thực thi cho Codex

Bạn đang sửa repo Avengers Coffee. Hãy đọc toàn bộ local workspace trước, đặc biệt các file modified/untracked; local code là source of truth, không được reset hoặc overwrite công việc đang có.

Mục tiêu ưu tiên là sửa triệt để bug cart/context của Chat AI:
- thêm nước số 2 + bánh số 1 thành công;
- sau đó chỉ “xem sản phẩm Matcha” không được phát lại add_to_cart hoặc tăng quantity bánh;
- hỏi lại cart phải luôn khớp Order Service/web cart;
- conversation dài/reload không làm bot quên business state;
- duplicate model/tool/retry không được mutate lần hai.

Hãy thực hiện PLAN V4 này theo từng phase. Bắt đầu bằng:
1. audit call path + git diff;
2. viết regression tests tái hiện bug;
3. hoàn tất Order Service single source of truth cho cart;
4. thêm idempotency business mutation;
5. thêm active-list/reference state và code-level mutation guard;
sau đó mới làm state V4, quote/action/version/capabilities và graph refactor.

Không chỉ sửa prompt. Mọi invariant về cart/write phải được enforce bằng code/backend. Sau mỗi phase chạy targeted tests; cuối cùng chạy toàn bộ tests, build Docker ai-service/order-service và ghi summary:
- files changed
- architecture changes
- tests run/results
- remaining risks/TODOs.
