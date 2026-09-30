# PLAN V5 — Stabilize Avengers Coffee AI Chat
## Cart-first, Context-safe, Transaction-safe

> Baseline: `main` hiện tại sau khi đã có LangGraph deterministic shell, authoritative Order Service cart cho authenticated user, structured product snapshots, request dedupe và add-cart idempotency.
>
> Mục tiêu V5 không phải rewrite chatbot. Mục tiêu là làm cho AI chat **ổn định như một transactional assistant**: không thêm nhầm món, không nhân số lượng, không quên món sau hội thoại dài, không suy luận bừa với “ừ/oke”, không dùng sai danh sách số thứ tự, và chỉ bước vào checkout khi cart + state đã đáng tin.

---

# 0. NON-NEGOTIABLE PRIORITY

Thứ tự triển khai bắt buộc:

1. **CART CORRECTNESS**
2. **REFERENCE / CONTEXT CORRECTNESS**
3. **CONVERSATION STATE / MEMORY**
4. **CONFIRMATION / SHORT REPLIES**
5. **PRODUCT / OPTIONS / STOCK**
6. **VOUCHER / FULFILLMENT / ADDRESS / BRANCH / PAYMENT**
7. **CHECKOUT / ORDER WRITE SAFETY**
8. **GRAPH CLEANUP / REFACTOR**

Không được nhảy thẳng vào checkout/LangGraph refactor nếu cart test chưa PASS 100%.

---

# 1. Current Architecture — GIỮ, KHÔNG ĐẬP ĐI

Runtime hiện tại cần giữ tư tưởng:

```text
POST /ai/agent/chat
        │
        ▼
conversation_memory
        │
        ▼
run_agent()
        │
        ▼
order_flow_graph
 ┌─────────────────────────┐
 │ sync authoritative cart │
 │ understand turn         │
 │ execute action          │
 │ render                  │
 └────────────┬────────────┘
              │
      ┌───────┴──────────┐
      ▼                  ▼
 deterministic writes   read-only LLM
      │                  │
      ▼                  ▼
 Cart/Order tools      product/FAQ/advice
      │
      ▼
 Order Service
```

Không quay lại mô hình LLM tự do gọi write tools.

`allow_model_mutations=False` phải tiếp tục là invariant cho conversational fallback.

---

# 2. PHASE A — CART HARDENING (P0 — LÀM TRƯỚC)

## A1. Canonical cart contract

Order Service phải trả **một envelope chuẩn**, không chỉ array row.

Target:

```json
{
  "cart_id": "user:<uid>",
  "cart_version": 17,
  "user_id": "...",
  "items": [
    {
      "line_id": 123,
      "product_id": 12,
      "product_name": "Matcha Latte",
      "quantity": 2,
      "size": "Vừa",
      "toppings": ["Trân châu"],
      "luong_da": "Ít đá",
      "do_ngot": "50%",
      "loai_sua": "Sữa tươi",
      "unit_price": 49000,
      "line_total": 98000,
      "configuration_signature": "..."
    }
  ],
  "item_count": 2,
  "subtotal": 98000
}
```

### cart_version
Tạo server-side version cho cart.

Có thể:
- bảng/cart metadata riêng;
- hoặc version counter theo user/cart;
- hoặc transaction-safe version store.

Yêu cầu:
- ADD success → version +1
- SET QUANTITY success → version +1
- UPDATE OPTIONS success → version +1
- REMOVE success → version +1
- CLEAR success → version +1
- idempotent replay same operation → version **không tăng**
- read → version không đổi.

Không dùng AI `cart_fingerprint` làm authoritative concurrency primitive nữa.
Fingerprint có thể giữ cho debug/backward compatibility trong transition.

## A2. Cart identity bắt buộc dùng `line_id`

Canonical mutation:

```text
SET quantity → line_id
EDIT options → line_id
REMOVE       → line_id
```

Không dùng:
- product name;
- product_id + size;
- fuzzy name;
làm canonical mutation identity.

`product_id + options signature` chỉ dùng cho backend merge decision khi ADD.

## A3. Configuration signature

Order Service tạo canonical signature từ:
- product_id
- size
- sorted toppings
- luong_da
- do_ngot
- loai_sua
- custom_attributes canonical JSON

Rule:
- cùng signature → ADD có thể merge quantity.
- khác signature → line khác.
- không để `"Matcha M + cheese"` merge với `"Matcha M + caramel"`.

Thêm tests.

## A4. Full mutation idempotency

Hiện ADD đã có idempotency. Mở rộng cùng framework/table cho:

- `UPDATE_CART_LINE`
- `REMOVE_CART_LINE`
- `CLEAR_CART`
- `APPLY_VOUCHER` / `REMOVE_VOUCHER` nếu những thao tác này trở thành business mutation backend
- sau này: `CREATE_ORDER`, `UPDATE_ORDER`, `CANCEL_ORDER`.

Controller nhận `X-Idempotency-Key`.

Same operation id:
- same request hash → stored result, no second mutation.
- different request hash → 409.

Không để DELETE/UPDATE retry gây side effect bất ngờ.

## A5. AI cart mirror chỉ read-only

`cart_manager.items` hiện chỉ được xem là:
- display cache;
- prompt snapshot;
- last-known state.

Authenticated user:
- mọi add/update/remove/clear → Order Service trước.
- success → refetch canonical cart → REPLACE mirror.
- Order Service failure → không local-write để “cho chạy tiếp”.

Nếu sync fail:
```json
{
  "status": "unavailable",
  "authoritative": false,
  "stale_snapshot": true
}
```

Bot không được nói chắc “giỏ đang có X” từ stale mirror.

## A6. Fix `_sync` fallback semantics

Hiện graph có fallback sang `cart_manager.get_cart()` khi authoritative sync exception.

Refactor:
- return explicit `cart_sync_status`.
- `authoritative=true/false`.
- mutation nodes **block** khi authenticated cart sync không authoritative.
- read cart có thể hiển thị cached snapshot chỉ nếu label rõ “dữ liệu gần nhất”, nhưng tốt hơn trả retry message.

## A7. `GET cart` phải là canonical read

Khi user:
- “giỏ có gì”
- “tôi đã thêm món gì”
- “tổng giỏ bao nhiêu”
- “còn món bánh lúc nãy trong giỏ không”

=> query/refetch Order Service trong turn đó.

Không trả dựa vào raw history.

---

# 3. PHASE B — CART REGRESSION TEST MATRIX (P0)

Trước khi đi tiếp, automated tests phải cover:

## B1. Bug thật: Matcha browse không nhân bánh

```text
show drink + food
user: thêm nước số 2 và bánh số 1
assert drink x1, cake x1
user: xem sản phẩm matcha
assert 0 mutation
assert cart_version unchanged
assert cake x1
user: giỏ có gì
assert same backend cart
```

## B2. Long read-only drift

```text
add 2 items
20–30 turns:
- hỏi Matcha
- review
- menu
- giá
- branch
- FAQ
- hỏi món khác
get cart
```

Assert:
- same lines
- same qty
- same cart_version.

## B3. Duplicate same mutation

Same `operation_id`:
- ADD
- UPDATE
- REMOVE
- CLEAR

Assert exactly-once.

## B4. Same product / different options

```text
Matcha M 50% đường
Matcha M 100% đường
```

2 lines.

ADD exact first config again:
- merge đúng rule.

## B5. Web ↔ AI consistency

Seed/change cart through Order Service as if Web UI changed it.
Next AI turn:
- must see latest cart.
- must not overwrite with old mirror.

## B6. New conversation

Create new `conversation_id`.
Cart backend stays unchanged.
Chat draft context reset only.

---

# 4. PHASE C — UNIFIED REFERENCE CONTEXT (P0/P1)

Mục tiêu: “số 1”, “món đó”, “cái kia”, “món hồi nãy” không được resolve từ history mơ hồ.

## C1. Replace scattered product snapshots with typed list contexts

Create canonical state:

```json
{
  "active_list_context": {
    "list_id": "uuid",
    "domain": "PRODUCT",
    "created_turn_id": "...",
    "mode": "GROUPED",
    "groups": {
      "DRINK": [
        {"ordinal": 1, "entity_id": "P1", "label": "..."},
        {"ordinal": 2, "entity_id": "P2", "label": "..."}
      ],
      "FOOD": [
        {"ordinal": 1, "entity_id": "P9", "label": "..."}
      ]
    },
    "items": []
  }
}
```

Tương tự domain:
- `VOUCHER`
- `BRANCH`
- `PAYMENT`
- `FULFILLMENT`
- `CART_LINE`
- `ORDER`

Không nhất thiết dùng đúng class/schema tên trên nếu code hiện tại có naming tốt hơn, nhưng phải có **typed namespace**.

## C2. Product grouped numbering

“Nước số 2 + bánh số 1”:
- DRINK #2
- FOOD #1.

Plain `"số 1"`:
- resolve chỉ khi active list có **một namespace hợp lệ duy nhất**;
- nếu có nhiều namespace có số 1 → hỏi lại.

## C3. New list replaces implicit reference context

Ví dụ:

```text
Bot list A: nước/bánh
User chọn vài món
...
User: xem Matcha
Bot list B: Matcha
User: thêm số 1
```

=> B#1.

Không fallback ngầm về A.

## C4. Historical reference only when explicit

Nếu user nói:
- “danh sách bánh lúc nãy”
- “món thứ 2 trong danh sách Matcha vừa rồi”

có thể resolve từ `recent_list_contexts` giới hạn nhỏ.

Nhưng plain `"số 2"` chỉ dùng active context.

## C5. Eliminate raw-history ordinal fallback

Hiện `_resolve_all_category_ordinals()` còn fallback `_resolve_numbered_product_choices()` qua history.

Migration:
1. thêm typed list context đầy đủ;
2. tests pass;
3. fallback chỉ telemetry warning;
4. sau đó bỏ fallback.

Không parse assistant prose cũ để quyết định write.

---

# 5. PHASE D — PRODUCT FOCUS & “HỎI LẮT LÉO” MEMORY (P1)

Đây là bug user mô tả:
> đang chọn sản phẩm A → hỏi lâu về thứ khác → hỏi sản phẩm B → bot lẫn A/B hoặc quên selection trước.

Không giải bằng tăng history từ 20 lên 50.

## D1. Separate `focus_entity` from `cart`

State:

```json
{
  "focus": {
    "domain": "PRODUCT",
    "entity_id": "P123",
    "label": "Matcha Latte",
    "source": "PRODUCT_DETAIL|RECOMMENDATION|USER_EXPLICIT",
    "turn_id": "...",
    "expires_policy": "REPLACE_ON_NEW_EXPLICIT_FOCUS"
  }
}
```

Rules:
- hỏi “món này có topping gì?” → use focus.
- user nêu rõ sản phẩm B → focus becomes B.
- browse list alone does not necessarily select product focus until user references a product.
- cart items do not become product focus automatically unless user asks edit on line.

## D2. Resume task / interrupted task

Create:

```json
{
  "resume_task": {
    "type": "CONFIGURE_PRODUCT",
    "product_id": "...",
    "pending_fields": ["size", "do_ngot"],
    "captured_values": {...}
  }
}
```

Example:
1. user chọn Matcha.
2. bot hỏi size.
3. user hỏi “bánh tiramisu bao nhiêu?”
4. bot trả lời.
5. user: “quay lại ly matcha, size vừa”.

Bot phải resume đúng Matcha configuration.

Read-only detour không clear `resume_task`.

Explicit abandonment:
- “thôi món đó”
- “bỏ Matcha”
- start incompatible new purchase and explicitly replaces task

=> clear/replace.

## D3. Durable pending product identity

`pending_products` nên chứa:
- stable product_id
- draft_id/pending_id
- product_name display
- quantity
- selected_options
- missing_options
- originating_list_id.

Không xóa pending item bằng fuzzy product-name match nếu có ID.

## D4. Conversation summary (optional after state)

History:
- recent 10 turns / 20 messages can remain.
- old history may be summarized.

Structured state is source for:
- selected/pending product
- active list
- focus
- cart ref
- voucher selection
- address/branch/payment
- pending interaction.

Never rely on summary to mutate business state.

---

# 6. PHASE E — SHORT REPLY / CONFIRMATION ENGINE (P0/P1)

Bug:
- “ừ”
- “ừ ừ”
- “uh”
- “ừm”
- “oke”
- “ok đó”
- “được”
- “đúng rồi”
- “thôi”
- “không”
dễ bị suy luận ngáo.

## E1. Introduce `pending_interaction`

Replace ambiguous generic pending-action use for conversational prompts with:

```json
{
  "pending_interaction": {
    "interaction_id": "...",
    "kind": "YES_NO|SELECT_ONE|FILL_FIELDS|FREE_TEXT",
    "domain": "CART|PRODUCT|VOUCHER|BRANCH|PAYMENT|FULFILLMENT|ADDRESS|CHECKOUT",
    "action": "ASK_MORE_ITEMS",
    "context_id": "...",
    "allowed_short_answers": true,
    "created_at": "...",
    "expires_at": "..."
  }
}
```

## E2. Short replies depend on expected interaction

`"ừ"` may be YES only if pending interaction is `YES_NO`.

Examples:

```text
Bot: Bạn có muốn thêm món nữa không?
User: ừ
=> YES
```

```text
Bot: Dùng địa chỉ mặc định này nhé?
User: ừ
=> YES
```

But:

```text
Bot: Bạn chọn voucher nào: 1, 2, 3?
User: ừ
=> INVALID_SELECTION
=> hỏi lại
```

```text
Bot: Chọn size Nhỏ/Vừa/Lớn?
User: oke
=> INVALID_SELECTION
=> hỏi lại
```

## E3. Vietnamese confirmation lexicon

Expand carefully, context-gated:

YES:
- ừ
- uh / uhm variants after normalization
- ừm (only YES_NO, not SELECT)
- được
- được đó
- đúng
- đúng rồi
- ok / oke
- đồng ý
- làm đi
- tiếp tục

NO:
- không
- thôi
- khỏi
- không cần
- bỏ qua
- dừng
- hết rồi
- không thêm nữa

AMBIGUOUS:
- “ừ nhưng...”
- “ok mà...”
- content includes another new command.

Rule:
if short-confirmation + material new content:
- parse new content first;
- do not blindly confirm pending action.

## E4. Pending interaction supersession

If bot asks YES_NO but user instead says:
> “xem Matcha đi”

That is a new explicit intent.
- do not interpret as NO/YES.
- suspend/clear appropriate pending prompt.
- preserve business state/resume task if compatible.

## E5. Clear lifecycle

When answer handled:
- clear exact `interaction_id`.
- never leave stale ask-more-items confirmation active across unrelated turns.

---

# 7. PHASE F — PRODUCT ADVICE / SEARCH QUALITY (P1)

Goal: user can ask naturally without corrupting cart state.

## F1. Read-only product advisor route

Questions like:
- “tôi thích ngọt nhưng ít cà phê”
- “món nào giống matcha nhưng béo hơn”
- “có bánh hợp với latte không”
- “món nào bán chạy”
- “món này ngon không”
- “món A khác món B sao”
- “có món dưới 50k không”

=> READ_ONLY route.
No write tools.

## F2. Recommendation result must create list context

Any rendered numbered recommendation:
- write canonical active list context from structured product IDs.
- UI payload uses same list IDs.
- no parsing reply text later.

## F3. Product advice grounding

Use canonical:
- Menu DB/product tool
- ratings/reviews
- recommendation service
- current pricing tool if asked price

LLM may describe/rank according to user taste, but:
- no invented products/options/prices.
- if exact price requested → authoritative product price lookup.

---

# 8. PHASE G — OPTIONS / TOPPING / EDIT CART LINE (P0/P1)

## G1. Canonical option schema

For each product:
- required option groups
- optional groups
- allowed values
- min/max selection
- surcharge semantics.

AI should not infer invalid option names.

## G2. Configuration workflow

For selected product:
1. resolve product ID.
2. fetch options.
3. build pending product draft.
4. collect missing required fields.
5. validate values.
6. add only when ready.

Read-only detours keep draft.

## G3. Edit line

Use line_id.

If user says:
> “đổi ly matcha thành ít đá”

and only one relevant cart line → edit it.

If multiple Matcha variants:
- present CART_LINE numbered list.
- set `pending_interaction=SELECT_ONE domain=CART_LINE`.
- do not guess based on stale last focus unless explicit context is strong.

## G4. Atomic update

Order Service `PATCH line_id` should:
- validate new options and authoritative price.
- merge with another identical line if business rule chooses, atomically.
- return full canonical cart + version.
- idempotent.

## G5. Remove

Same:
- resolve exact line_id.
- if ambiguous → ask.
- idempotent remove.
- refetch canonical cart.

---

# 9. PHASE H — STOCK / AVAILABILITY (P0 BEFORE CHECKOUT)

Current code can price/check with branch `"Chưa chọn"`.
Need distinguish availability stages.

## H1. Availability states

Return explicit:
- `UNKNOWN_BRANCH`
- `AVAILABLE`
- `OUT_OF_STOCK`
- `INSUFFICIENT_QUANTITY`
- `PRODUCT_DISABLED`
- `OPTION_UNAVAILABLE`

Do not say “còn hàng ở cửa hàng” if branch unknown.

## H2. Browse-time

Before branch selected:
- product can be shown from menu.
- wording: “món đang có trên menu”; not guarantee branch stock.

## H3. Branch selection

After branch chosen:
- validate each cart line at that branch.
- return stock conflicts by `line_id`.

## H4. Revalidate before quote and before order creation

Cart can change or stock can change.

Mandatory:
- quote-time stock validation.
- confirm/create-order stock revalidation.

If conflict:
- do not create order.
- preserve cart.
- explain exact unavailable lines and offer replace/remove/change branch.

---

# 10. PHASE I — VOUCHER (P1)

## I1. Source of truth

Voucher eligibility must use authoritative cart subtotal/version.

Remove fallback where applicable voucher logic silently trusts stale local cart when authoritative sync fails.

If cart unavailable:
- voucher eligibility unavailable.

## I2. Typed voucher list

When vouchers listed:
```text
active_list_context.domain = VOUCHER
```

“mã số 2” resolves only there.

Plain “số 2” resolves voucher only if current pending interaction is voucher SELECT_ONE.

## I3. Voucher application state

Persist:
- voucher_code
- evaluated_cart_version
- discount
- eligibility result.

Cart mutation after voucher:
- mark voucher as needs_revalidation.
- quote recalculates.

Do not trust previous discount after cart changed.

---

# 11. PHASE J — FULFILLMENT / ADDRESS / BRANCH / PAYMENT (P1)

Do not ask all choices at once if that creates ordinal ambiguity.

## J1. Sequential interaction

Preferred flow:

```text
fulfillment?
→ address/location if required
→ branch?
→ voucher?
→ payment?
→ quote
```

Exact order may vary by domain requirement, but each interaction should have one typed namespace.

## J2. Fulfillment

Typed values:
- DELIVERY
- PICKUP
- DINE_IN

Short “ừ” cannot select fulfillment unless bot asked YES_NO about one specific proposed fulfillment.

## J3. Address

Separate:
- profile saved address
- confirmed delivery address
- temporary search location

State:
```json
{
  "address_state": {
    "suggested_address_id": "...",
    "confirmed_address_snapshot": {...}
  }
}
```

YES/NO confirmation only applies to exact suggested address/context id.

## J4. Nearest branch

Geocode target address/location.
Store branch candidates as typed BRANCH list.

If user detours to product question:
- candidate list may remain in recent context,
- but not become implicit product/list namespace.

When user selects branch:
- branch ID stored.
- immediately validate stock.

## J5. Payment

Typed PAYMENT list:
- VNPAY
- BANK_QR
- WALLET
- COD

Do not show fulfillment and payment numbered lists simultaneously if user can answer only “số 2”.

If UI must show both:
- ordinals need explicit namespaces or buttons with IDs.

---

# 12. PHASE K — CONVERSATION STATE V5 (P1)

Currently state is distributed across graph state + `checkout_prefs` + conversation memory.

Create one canonical Pydantic/TypedDict state, migrated incrementally.

Target conceptual schema:

```json
{
  "schema_version": 5,
  "conversation_id": "...",
  "state_version": 4,

  "cart_ref": {
    "cart_id": "...",
    "cart_version": 17,
    "authoritative": true
  },

  "focus": null,
  "active_list_context": null,
  "recent_list_contexts": [],

  "pending_products": [],
  "resume_task": null,
  "pending_interaction": null,

  "checkout_draft": {
    "fulfillment": null,
    "address": null,
    "branch_id": null,
    "payment_method": null,
    "voucher_code": null,
    "quote_id": null,
    "quote_cart_version": null
  },

  "last_order_id": null
}
```

## K1. State ownership

- Order Service owns business cart/order.
- Conversation state owns conversational choices/draft/reference.
- Message history owns dialogue text.

## K2. DB persistence

Use existing `chat_ai_conversation.state`.
Avoid duplicating same state independently in two DB rows long-term.

Migration can temporarily sync `cart_manager.checkout_prefs`, but target:
- one canonical persisted structured state per conversation.

## K3. History strategy

Do not just increase messages.

Use:
- recent 20 messages;
- structured state;
- optional compact conversation summary for older topics.

Old summary is read-only context, never write authority.

---

# 13. PHASE L — MUTATION POLICY GATE (P0/P1)

Current graph already disables model mutations. Formalize a single policy gate.

TurnPlan:

```json
{
  "intent": "SEARCH_PRODUCT",
  "mode": "READ_ONLY",
  "allowed_mutations": [],
  "resolved_entities": []
}
```

Modes:
- READ_ONLY
- CART_WRITE
- CHECKOUT_DRAFT_WRITE
- ORDER_WRITE

Invariant:
READ_ONLY => cart_version_before == cart_version_after.

Block mutation if LLM/tool tries it anyway.

Log:
- `BLOCKED_MUTATION_ATTEMPT`.

---

# 14. PHASE M — CHECKOUT ONLY AFTER CART GATE PASSES (P1/P2)

Do not implement deeper checkout safety until:
- cart test suite zero fail;
- reference tests zero fail;
- long-history test zero fail;
- short reply interaction tests zero fail.

Then:

## M1. Authoritative quote

Quote contains:
- quote_id
- cart_id
- cart_version
- branch
- fulfillment
- address snapshot/ref
- voucher
- prices
- fees
- final total
- expires_at.

## M2. General pending transaction action

```json
{
  "action_id": "...",
  "action_type": "CREATE_ORDER",
  "resource_id": "...",
  "cart_version": 17,
  "quote_id": "...",
  "expires_at": "...",
  "status": "AWAITING_CONFIRMATION"
}
```

“ừ” confirms only if:
- pending_interaction YES_NO references that action_id.

## M3. Confirm action

Before creating order:
- action ownership
- not expired
- quote valid
- expected cart version matches
- branch stock still valid
- voucher still valid
- payment method still allowed.

Double confirm/retry:
- exactly one order.

---

# 15. PHASE N — BUSINESS CAPABILITIES

Backend should return allowed actions rather than AI duplicating order rules.

For order:
```json
{
  "version": 8,
  "available_actions": {
    "can_edit": false,
    "can_cancel": true,
    "can_pay": false
  }
}
```

For cart/checkout:
- can_checkout
- missing requirements
- supported payment methods
- branch/fulfillment constraints.

AI presents reasons; backend decides.

---

# 16. PHASE O — LANGGRAPH CLEANUP (LÀM CUỐI)

`execute_action` is currently a large deterministic God-node.

Only after behavior is stable, split gradually:

```text
sync_cart
  ↓
load_conversation_state
  ↓
understand_turn
  ↓
resolve_reference
  ↓
policy_gate
  ├─ product_read
  ├─ cart_read
  ├─ cart_write
  ├─ product_config
  ├─ voucher
  ├─ fulfillment
  ├─ location_branch
  ├─ payment
  ├─ checkout_prepare
  ├─ confirm_action
  └─ generic_read_only_agent
  ↓
render
  ↓
persist_state
```

Do not change behavior and architecture simultaneously.
First lock tests, then extract nodes.

---

# 17. OBSERVABILITY

Per turn structured log:

```text
conversation_id
client_message_id
turn_id
state_version
intent
policy_mode
pending_interaction.kind/domain
active_list.list_id/domain
focus.entity_id
cart_id
cart_version_before
cart_version_after
tool/action
operation_id
blocked_mutation
result
latency
```

Invariants:
- READ_ONLY + cart version changed => ERROR.
- same operation_id + version changed twice => ERROR.
- bot says “đã thêm” without successful authoritative mutation => ERROR.
- mutation with authoritative cart unavailable => ERROR/BLOCK.
- resolved ordinal from inactive stale list => warning/error.

---

# 18. TEST SUITE — ACCEPTANCE SCENARIOS

Create automated tests for these user transcripts.

## Cart
1. add nước #2 + bánh #1 → exact lines x1.
2. browse Matcha → no mutation.
3. ask 20 questions → cart same.
4. web changes cart → chat sees it.
5. duplicate ADD → one write.
6. duplicate UPDATE → one effect.
7. duplicate REMOVE → one effect.
8. clear double retry → one logical clear.
9. same product different toppings → separate lines.
10. edit one of two same-name variants → correct line.

## Context / Product
11. list A → list B → “số 1” resolves B.
12. “nước số 2 + bánh số 1” resolves both.
13. voucher #2 never resolves product #2.
14. branch #2 never resolves product #2.
15. payment #2 never resolves fulfillment #2.
16. ambiguous plain “số 1” → clarify, no write.

## Long conversation
17. select Matcha, bot asks size.
18. user asks 10 unrelated product questions.
19. user says “quay lại ly matcha, size vừa”.
20. correct pending Matcha resumed.

## Short replies
21. ask-more-items + “ừ” => yes.
22. ask-more-items + “không thêm nữa” => no and clear prompt.
23. address yes/no + “ừ ừ” => yes.
24. voucher select + “ừ” => ask which voucher.
25. size select + “oke” => ask which size.
26. checkout confirm + “oke” => confirm exact action.
27. checkout confirm + “oke nhưng đổi sang QR” => change payment first, invalidate prior confirmation.

## Stock
28. branch unknown → do not promise stock.
29. choose branch → validate all lines.
30. out of stock line → preserve cart, present conflict.
31. stock changes after quote → create order rejected/requote.

## Voucher
32. voucher eligibility calculated using authoritative current cart.
33. cart changes after voucher → voucher revalidated.
34. expired/invalid voucher never remains in final quote.

## Reset
35. new conversation resets draft/history but preserves backend cart.
36. explicit clear cart clears backend cart.

---

# 19. DEFINITION OF DONE — V5

V5 is not done unless:

### P0 cart
- full cart-related tests 0 fail.
- no cart write from READ_ONLY turns.
- authoritative cart and Web UI match.
- cart_version implemented.
- ADD/UPDATE/REMOVE/CLEAR idempotent.
- line_id used for update/remove.
- AI mirror cannot overwrite backend.

### Context
- no implicit raw-history ordinal writes.
- active list typed.
- long product-detour resume works.
- “món đó/cái kia/số N” deterministic or clarification.

### Short replies
- `"ừ"`, `"ừ ừ"`, `"oke"` depend on pending interaction type.
- selection prompts never treat “ừ” as an ordinal selection.

### Product/options/stock
- required options maintained through detours.
- edits target correct cart line.
- branch-aware stock validated before checkout.

### Checkout
- only begins after authoritative cart sync.
- quote ties to cart_version.
- confirmation tied to action_id.
- double submit cannot create two orders.

### Tooling
- full AI pytest PASS.
- Order Service tests PASS.
- builds PASS.
- `git diff --check` PASS.
- no new traceback in Docker E2E.

---

# 20. IMPLEMENTATION ORDER FOR CODEX

Do this as incremental batches, not one mega-refactor.

## Batch 1 — Cart contract + cart_version
Files likely:
- order-service cart entity/service/controller/spec
- ai cart_tools.py
- cart_manager.py
- order_flow_graph.py
- tests

Deliver:
- canonical envelope
- cart_version
- authoritative sync status
- tests.

STOP and report.

## Batch 2 — Full mutation idempotency
- update
- remove
- clear
- tests
- stable operation id generation.

STOP and report.

## Batch 3 — Typed active list/reference resolver
- product grouped namespaces
- voucher/branch/payment/fulfillment namespace model
- eliminate write fallback to raw history
- tests.

STOP and report.

## Batch 4 — Product focus / resume task / durable pending product
- interrupted conversation tests
- no loss after read-only detours.

STOP and report.

## Batch 5 — pending_interaction / confirmation engine
- “ừ/oke”
- yes/no vs select-one
- supersession rules
- lifecycle cleanup.

STOP and report.

## Batch 6 — options/edit/stock
- line-based edit
- required options
- branch-aware availability
- quote-time revalidation.

STOP and report.

## Batch 7 — voucher/fulfillment/address/branch/payment
- typed interactions
- sequential namespaces
- authoritative voucher validation.

STOP and report.

## Batch 8 — checkout safety
- quote_id + cart_version
- action_id
- create-order idempotency
- stale action detection.

STOP and report.

## Batch 9 — graph cleanup
Only extract nodes after all behavior tests pass.

---

# 21. DO NOT

Codex must NOT:

- fix memory by only increasing prompt history.
- fix “ừ” only by adding it to a global YES set.
- let model choose write semantics.
- reintroduce mutating tools into read-only LLM fallback.
- maintain two writable carts.
- use stale AI mirror when authenticated Order Service is down.
- remove/update cart line via fuzzy name when line_id is available.
- parse assistant prose as canonical reference state for writes.
- make `cart_fingerprint` replace server cart_version.
- let branch-unknown inventory check claim store-specific availability.
- use `unit_price` from LLM as backend authority.
- refactor the entire LangGraph before regression behavior is locked.
- delete existing working tests just because architecture changed.
- reset/revert unrelated developer changes.

---

# 22. REPORT FORMAT AFTER EACH BATCH

Codex must report:

1. Files changed.
2. Root causes found.
3. Architecture change.
4. Backward compatibility impact.
5. Tests added/updated.
6. Commands run and exact result.
7. Remaining failing tests.
8. Remaining risks.
9. Whether acceptance criteria for this batch passed.
10. Stop and wait for approval before the next batch.
