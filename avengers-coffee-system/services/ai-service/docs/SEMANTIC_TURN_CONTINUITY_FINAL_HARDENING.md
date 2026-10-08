# Final customer chatbot turn-continuity hardening

## State and scope

- `STARTING_HEAD = 1e6ca05c2c37536b25a7767154757eff558087f1` (`chua xong chatbot dc`). Branch: `branch_thaian`.
- The actual starting worktree was clean. Historical `460e8ab` was not reset, reverted or cherry-picked.
- Implementation, generated audits, scripted tests and this report are uncommitted worktree changes under `services/ai-service` only. No DataPlatform change, credential change or automatic commit.
- `LIVE_PROVIDER_REQUESTS = 0`. Qualification used fake/scripted providers in Docker with `--network none`, synthetic fixtures and `.env.example`; no real `.env` was mounted into qualification containers. No UI or human/live chat test was run.

## Fresh baseline and confirmed cause

The actual baseline was rerun before editing:

| Baseline | Passed | Failed | Skipped | Warnings | Duration |
|---|---:|---:|---:|---:|---:|
| Focused semantic/repair/provider | 769 | 0 | 0 | 1 | 5.59s |
| Full `python -m pytest tests -q --tb=short` | 3407 | 0 | 1 | 2 | 21.77s |

Baseline logs: `/private/tmp/turn-continuity-focused-baseline.log` and `/private/tmp/turn-continuity-full-baseline.log`. Failing baseline test IDs: none.

The gap was structural: PRE_TOOL format repair reused the normal semantic surface; write repair accepted arbitrary READ access as a prerequisite; successful executor evidence could then unlock deterministic presentation. A perfectly valid `READ_MENU` returning `ok` could substitute for product configuration in the same user turn. Schema validation and business authorization were already necessary boundaries, but did not prove progress toward the frozen turn goal. No customer phrase was used as a routing rule in this change.

## Server-owned architecture

`semantic_progress.py` declares a complete, explicit policy for all 48 business operations: goal family, PRIMARY/PREREQUISITE/CONSULTATION/FINALIZATION role, state effect, terminal flag and exact prerequisite IDs. `semantic_registry.py` incorporates this policy and rejects missing metadata/coverage. There is no access-based progress fallback. The additional `semantic_interrupt` is a separate closed control schema, with no business executor; it does not change the 48-operation mapping inventory.

`turn_contract.py` owns continuity using server state and the semantic execution journal. It records contract ID, strongest unfinished state obligation, actual proposed goal, repair mode, operation, facet, canonical target, commitment class, committed writes, prerequisite/interrupt counters, progress and completion reason. Its inputs contain no raw utterance parsing or language classifier.

The strongest state obligation is not current user intent. Normal first-round typed proposals can legitimately change topic. When state provides a strong obligation, the advertised normal surface contains that domain, explicitly registered local companions and the control interrupt. Fulfillment/location/payment companions permit normal compound choices and corrections. Without a strong obligation, the existing business-authorized discovery/consultation surface is retained.

Repair is different: there is no new customer message. PRE_TOOL repair uses the strongest unfinished milestone, or restricted GENERIC_CONSULTATION when none exists. A known failed typed operation freezes its own operation/facet/target/commitment and exact prerequisite corridor. Business capability and state exposure checks still apply independently. POST_TOOL final-envelope repair has no business tools.

Execution order is now:

`typed proposal -> whole-response continuity eligibility -> existing SemanticPlan -> canonical grounding -> business gateway -> authoritative result -> turn-progress proof -> presentation/conditional continuation`.

Eligibility is checked for the whole response before any member executes. One wrong-domain member rejects a mixed response before a valid write sibling can run. Rejected actions do not enter the execution journal or create UI evidence. Canonical target and commitment checks prevent an otherwise compatible operation from changing the grounded subject or upgrading a question to a purchase.

## Progress and completion proof

`validate_turn_progress` checks registry compatibility, authoritative executor evidence, explicit prerequisite status, declared discovery reads, business state milestones and pending plan rows. `status=ok` alone is insufficient. Payment/fulfillment/branch/checkout success requires its authoritative state milestone; successful configuration cannot claim a changed cart while cart and pending configuration are unchanged. Valid empty catalog evidence counts as a completed read, without inventing product cards.

Outcomes are PROGRESSED, PREREQUISITE_COMPLETED, COMPLETED, NON_PROGRESS, BLOCKED and NEEDS_REPAIR. A registered prerequisite remains nonterminal for its parent operation even when its executor succeeds. A direct read question can complete its own goal after an explicit domain switch binds that read as the primary operation. Thus an operation's `terminal_for_goal=false` prerequisite metadata does not prohibit answering a standalone options/payment question; it prohibits using that read to close the parent write goal.

Completion comes from goal-specific authoritative evidence and plan closure, a real business clarification boundary, or an allowed direct/social response. The production loop reads TurnContract progress instead of treating any successful tool as repaired completion. A healthy configuration still needs one semantic inference. There is no unconditional classifier/judge call.

## Safe topic change and bounded continuation

`semantic_interrupt(target_domain)` accepts one of the 15 registry goal families. It is closed, read/control only, returns `changed=false`, requires a continuation and opens only the selected domain. Pending products, cart, payment, location and order drafts are preserved. It cannot complete the turn by itself. The next typed operation establishes whether the scoped goal is a read question or a state-changing operation.

Interrupts are conservative: an unfinished execution journal or committed writes prohibit switching away, including a failed compound journal before its first write. A normal new turn or pre-tool malformed response without such a journal may switch. This prevents silently dropping sibling actions.

Repair budgets remain bounded: one format repair, one semantic protocol repair, at most one exact prerequisite round and one explicit interrupt, within the existing global tool-round budget (default six; existing final-only repair slot retained). A repeated wrong valid operation exhausts protocol repair rather than retrying until lucky. Typical fixture budgets: healthy config 1 inference; malformed -> wrong valid read -> correct config 3; malformed -> exact prerequisite -> primary 3; interrupt -> domain operation 2; malformed -> interrupt -> domain operation 3. Repeated prerequisites are denied; they cannot reset a repair budget.

## Exact prerequisites and legacy compatibility

Examples from the complete 48-operation audit:

- CONFIGURE_PRODUCT / USE_PRODUCT_DEFAULTS: ASK_PRODUCT_OPTIONS only.
- SET_PAYMENT: READ_PAYMENT_OPTIONS only.
- CHOOSE_VOUCHER: READ_ELIGIBLE_VOUCHERS only.
- REMOVE_CART_LINE: READ_CART only; UPDATE_CART_LINE additionally permits ASK_PRODUCT_OPTIONS.
- SELECT_PRODUCT: DISCOVER_PRODUCTS / ASK_PRODUCT_OPTIONS. Semantic selection is a state-changing operation even though its executor reads options.
- SELECT_LOCATION_CANDIDATE: FIND_NEARBY_BRANCHES only; SELECT_BRANCH: READ_BRANCHES / FIND_NEARBY_BRANCHES.
- RESOLVE_NEW_LOCATION / SELECT_PROFILE_ADDRESS: explicit SET_FULFILLMENT prerequisite when needed; saved-address selection also permits READ_PROFILE_ADDRESSES. This is an explicitly authorized semantic state transition, not a generic READ exemption. It still needs current commitment/evidence and independent business authorization, and cannot itself finish location repair.
- Order cancel: READ_ORDER; order update/reorder: READ_ORDER, ASK_PRODUCT_OPTIONS, ASK_PRODUCT_PRICE.
- CONFIRM_CHECKOUT / CONFIRM_ORDER_CHANGE: no prerequisites.

Production no longer stages legacy `actions` found in prose and no longer asks for `Call customer_actions` when only typed tools are advertised. A malformed prose envelope uses the typed repair/interrupt surface. Internal migration adapters and `semantic_mode=False` compatibility remain, but cannot bypass an active production repair contract. Existing direct internal adapter tests remain; affected production-loop fixtures now emit typed schemas rather than unadvertised `customer_actions`.

## Presentation quarantine and compound preservation

An open constrained contract blocks deterministic customer-step, flow and discovery rendering, final display publication and unproven final envelopes. Non-cart UI artifacts are quarantined on unresolved fallback. Accepted prerequisite artifacts are retained internally for continuation but cannot close the turn. Rejected wrong-domain operations execute nothing, so create no menu/product/order/branch/voucher artifacts in the first place. Confirmed cart changes may still be shown in a truthful partial result.

The original SemanticPlan retains action IDs, original ordinals, dependencies, canonical targets and successful sibling results. Repair changes only the failed proposal. Tests cover first-action repair and partial execution, with remove original #2, update original #3 and options on another line; wrong valid reads and interrupts cannot erase remaining siblings. Successful targets are not replayed, and repeated `client_message_id` returns the existing completed result without a new inference or write.

## Business invariants retained

Fulfillment evidence cannot authorize payment; missing payment cannot become COD. Questions, negations and hypothetical choices remain noncommitting. Selected geo candidates reuse immutable coordinates/fingerprint and cannot be substituted with a profile address. Checkout still requires a fresh prior-turn summary, matching cart/address/payment/branch/voucher/totals, action ID and expiry; confirmation cannot silently rebuild a summary. Order changes remain owned-order previews with closed nested schemas and later explicit confirmation. Recommendation still requires current Menu scope/identity and approved description evidence, with no bestseller fallback; RAG/reviews keep sanitization and output provenance. Provider route/round timeouts, cooldown/failover, Gemini signatures, no write replay and idempotency were not weakened.

## Generated adversarial qualification

- 15 goals × 48 operations = 720 compatibility cases.
- 48 frozen-operation repair cases each inspect all 48 operations = 2304 exact operation/prerequisite comparisons.
- 675 valid wrong-goal/operation pairs exercise preexecution denial, no business mutation, no reads, no artifact/state changes; the matrix module additionally covers whole-response mixed rejection and quarantine (677 tests total).
- All 48 business operations also have real scripted-provider-loop probes: malformed typed operation -> perfectly valid wrong-domain read -> bounded MODEL_PROTOCOL failure, zero business reads/writes, no unrelated cards. Turn replay-cache bookkeeping is allowed and is distinguished from business-state mutation.
- Provider fuzz covers multiple wrong reads, a valid write mixed with an unrelated read, malformed/repeated interrupts, repeated prerequisites, exact canonical prerequisite targets and repair exhaustion.
- Stateful recommendation -> select -> options -> malformed config -> valid READ_MENU/order/payment read -> correct config succeeds in the same user turn, exactly one write and no customer repeat.
- Discovery and FAQ interruptions preserve pending products; normal social turns remain direct and do not force a purchase.

Existing test functions were preserved (AST comparison against starting HEAD); no new skips were added. Legacy production-loop scripts were migrated to the newly advertised typed functions. Historical tests that used arbitrary discovery as repair now use exact registered option/catalog prerequisites, retaining their canonical identity, sibling/write-fence and business-result assertions. The new adversarial tests explicitly require rejection of the formerly permitted unrelated reads.

## Surface measurements

Counts include the control interrupt in the new surfaces. JSON lengths use `ensure_ascii=False` and the same ten authoritative fixtures for before/after. The starting HEAD reused the before-normal surface for PRE_TOOL repair. The complete operation lists, per-operation justifications, exact protocol surfaces and all metadata are in `SEMANTIC_TURN_CONTINUITY_STATIC_AUDIT.json`.

| State | Before normal/repair count · chars | New normal count · chars | New PRE_TOOL repair count · chars |
|---|---:|---:|---:|
| BROWSING | 20 · 9985 | 21 · 10657 | 1 · 672 |
| PRODUCT_SELECTED | 25 · 13980 | 9 · 6291 | 4 · 3088 |
| PRODUCT_CONFIGURATION | 25 · 13980 | 9 · 6291 | 4 · 3088 |
| CART | 30 · 15446 | 31 · 16118 | 3 · 2113 |
| VOUCHER | 31 · 16112 | 8 · 4010 | 5 · 2099 |
| FULFILLMENT | 30 · 15446 | 7 · 3397 | 2 · 1360 |
| LOCATION | 33 · 17075 | 9 · 4705 | 7 · 3852 |
| PAYMENT | 32 · 16409 | 12 · 6143 | 3 · 1525 |
| CHECKOUT_SUMMARY | 35 · 17805 | 15 · 7539 | 3 · 1402 |
| ORDER_MANAGEMENT | 35 · 19619 | 9 · 6095 | 9 · 6697 |

Pending-product repair is exactly CONFIGURE_PRODUCT, USE_PRODUCT_DEFAULTS, ASK_PRODUCT_OPTIONS and semantic_interrupt: 25 -> 4 declarations, 13,980 -> 3,088 schema characters. Its normal surface is 9 declarations / 6,291 characters. Browsing and a plain cart without a unique obligation retain the existing authorized universe plus one interrupt; no intent is invented from the state. Browsing without product candidates can have only the control operation in generic repair because no grounded product-fact read is available. Order-management repair may have as many declarations as the reduced normal surface because exact order-detail/options/price prerequisites replace unrelated domains; it still falls from the original 35 declarations to 9. No arbitrary numeric target was imposed.

## Ordered final qualification

Reproduction: run `python -m scripts.qualify_turn_continuity` in the ai-service image with source mounts and `--network none`. Only `tests/` is collected; repository-root ad hoc diagnostics are not part of this suite. Complete commands, exit codes and counts are in `SEMANTIC_TURN_CONTINUITY_QUALIFICATION.json`; logs are in `/private/tmp/turn-continuity-qualification/`.

| Order | Group | Exact pytest result |
|---:|---|---|
| 1 | registry_progress_metadata | 50 passed in 0.34s |
| 2 | turn_contract | 18 passed in 0.60s |
| 3 | repair_surface | 770 passed in 0.87s |
| 4 | wrong_valid_matrix | 677 passed in 2.28s |
| 5 | artifact_quarantine | 1 passed, 676 deselected in 0.64s |
| 6 | pre_tool_repair | 15 passed, 61 deselected, 1 warning in 2.27s |
| 7 | semantic_protocol_repair | 288 passed, 1 warning in 3.62s |
| 8 | post_tool_final_repair | 36 passed, 1 warning in 1.26s |
| 9 | safe_interrupt | 11 passed, 73 deselected, 1 warning in 2.10s |
| 10 | compound_plan | 25 passed, 65 deselected, 1 warning in 1.21s |
| 11 | product_configuration | 108 passed, 1 warning in 3.32s |
| 12 | recommendation | 118 passed, 1 warning in 2.52s |
| 13 | cart_voucher | 166 passed, 1 warning in 2.51s |
| 14 | fulfillment_location_payment | 137 passed, 1 warning in 1.52s |
| 15 | checkout | 117 passed, 1 warning in 1.44s |
| 16 | order | 142 passed, 1 warning in 1.65s |
| 17 | rag_reviews | 222 passed, 2 warnings in 2.92s |
| 18 | provider_resilience | 99 passed, 1 warning in 2.05s |
| 19 | full_ai_service | 4990 passed, 1 skipped, 2 warnings in 24.24s |

Final full suite: **4990 passed, 0 failed, 1 skipped, 2 warnings in 24.24s**. Net increase over the actual baseline: 1583 passed tests. All 19 groups returned exit code 0. Focused groups overlap and are not summed as distinct tests. `-k` deselections are focused subsets, not test skips.

The existing skip is the opt-in Redis integration test. The existing warnings are LangChain's future `allowed_objects` default and Starlette/AnyIO's deprecated BlockingPortal alias. No new failure, skip or warning remains. Intermediate development runs exposed fixture migration and continuation errors; they were resolved before this ordered qualification, with no tests deleted.

## Build and runtime verification

`docker compose build ai-service` completed successfully (exit 0). `docker compose up -d --no-deps ai-service` recreated only `avengers_ai_service` successfully (exit 0). No compose down, volume removal, orphan removal or DataPlatform action was performed. Compose printed its existing orphan-container warning; no orphan was removed.

Running container: `4cecc06f102f696c688f3338b86194ea6a6f1461944c97b498665e4ea4fe7e56`. Running image: `sha256:259298d7ceca95348dc355923ffd8a47e8563d2591eead580b0b13aad8f9f085`.

Local `GET /ai/health` in the recreated container returned **HTTP 200**, `status=ok`. The endpoint inspects availability/configuration and local Redis state; it does not run model inference. Startup trains the existing local CF/forecast models, not an external LLM. SHA-256 checks matched all seven changed/new production modules in `/app` against the qualified worktree.

Evidence: `/private/tmp/turn-continuity-build.log`, `/private/tmp/turn-continuity-recreate.log`, `/private/tmp/turn-continuity-health.log` and `/private/tmp/turn-continuity-runtime-hashes.json`.

`LIVE_PROVIDER_REQUESTS = 0`.

## Static audit answers

| Question | Answer |
|---|---|
| Can READ_MENU close PRODUCT_CONFIGURATION repair? | NO. Preexecution eligibility rejects it. |
| Can an unrelated valid operation count as progress merely because status=ok? | NO. Goal/operation, authority and completion proof are required. |
| Can repair expose arbitrary READ prerequisites? | NO. Exact registry IDs only. |
| Can PRE_TOOL repair reopen the full unrelated universe? | NO. State corridor or restricted generic corridor plus control. |
| Can a genuine user change topic? | YES, safely, on a normal turn or explicit permitted interrupt. |
| Can a safe switch silently mutate/discard pending business state? | NO. Control only; pending state remains. |
| Can rejected repair artifacts reach the user? | NO. Whole-response preflight plus presentation quarantine. |
| Can protocol repair erase compound siblings or replay a successful write? | NO. Original journal, targets and write fences remain. |
| Can payment default to COD or a confirmed address drift? | NO. Explicit canonical payment and destination freshness guards remain. |
| Can raw business executors/customer_actions become model-facing? | NO in semantic production; only semantic_* declarations. |
| Can repair request an unadvertised customer_actions function? | NO. Production prose staging path removed and tested. |
| Was any new production semantic regex added? | NO. Diff audit found no added regex calls; new continuity modules contain none. |
| Was any unconditional extra classifier/model call added? | NO. Additional inference is conditional on repair/interrupt/existing continuation. |
| Was any live provider called? | NO. LIVE_PROVIDER_REQUESTS = 0. |

## Remaining limitations

- Scripted providers qualify server semantics and boundaries, not live Vietnamese interpretation quality. The user performs the manual/live matrix below.
- If a first malformed response contains no trustworthy semantic operation and no unique state obligation, the model must explicitly interrupt from the restricted generic corridor. This may cost one conditional inference.
- A pending execution journal, even before any write, deliberately prohibits interrupt abandonment. The model must repair it or return a controlled failure; ordinary pending business drafts can still be interrupted on new turns.
- Normal browsing/cart surfaces stay broad where server state cannot justify a narrower intent corridor. Reduced stateful surfaces rely on the model's typed interrupt for unrelated domains; conditional domain continuation has a latency cost.
- `terminal_for_goal` is contextual: prerequisite reads cannot close parent writes, while a directly requested read can complete its own explicitly bound domain goal.
- The opt-in Redis integration skip remains; no live provider or browser behavior was qualified.

## Manual human/live matrix — prepared only, NOT executed

Use real Menu choices and existing candidate lists. Rows may be separate scenarios where the precondition says so; do not infer business authorization from the wording template alone. For adversarial repair observation, inspect TurnContinuity fields rather than requiring the live provider to fail on demand.

| # | Customer turn / precondition | Goal / expected semantic family | Expected state transition | Forbidden behavior | Key log invariant |
|---:|---|---|---|---|---|
| 1 | “Hôm nay hơi lạnh, gợi ý món ngọt nhẹ cho mình.” | DISCOVERY / RECOMMEND_BY_PREFERENCE | Current Menu + description-backed cards | Invent hot/cold availability or taste; sales fallback | Goal DISCOVERY; authoritative approved evidence |
| 2 | “Mình lấy ly đầu tiên nhé.” After cards. | PRODUCT_SELECTION / SELECT_PRODUCT | Canonical pending product; show options | Add/default without consent | Canonical target; pending_product effect |
| 3 | “Ly đó size L, ít đá, ít ngọt, thêm trân châu trắng nhé.” Only if topping is in Menu options. | PRODUCT_CONFIGURATION / CONFIGURE_PRODUCT | Validate supplied options; one cart write | READ_MENU replacing config; invented topping | Repair corridor config/options/defaults; COMPLETED or real option clarification |
| 4 | “À đổi ý, cho xem cà phê sữa trước đi.” With pending product. | DISCOVERY / interrupt then discover | New matching cards; preserve draft | Auto-configure/discard old draft | INTERRUPT_PENDING then scoped completion |
| 5 | “Cho mình một cà phê sữa và một ly trà đào.” With matching Menu names. | PRODUCT_SELECTION / two selections | Two independent pending identities | Merge drafts or choose arbitrary family variants | Original action IDs and canonical targets |
| 6 | “Cà phê size M, ít đá nhé.” With two pending products. | PRODUCT_CONFIGURATION | Configure only identified coffee | Apply options to tea | Must preserve correct product target |
| 7 | “Trà đào cứ theo công thức quán.” | PRODUCT_CONFIGURATION / USE_PRODUCT_DEFAULTS | Explicit Menu defaults for remaining tea | Default another product | Current commitment/evidence; one write |
| 8 | “Bỏ món số 2, món số 3 lấy hai phần, món đầu bớt ngọt.” At least three cart lines. | CART_EDIT / remove + update + update | Preserve original ordinals; three intended edits | Shift #3 after removal, lose siblings or replay writes | Frozen targets; stable action IDs; no interrupt after write |
| 9 | “Mình chọn đủ rồi, cho xem ưu đãi nhé.” | VOUCHER / FINISH_CART | Open eligible voucher gate | Auto-apply voucher/payment | Authoritative voucher choice boundary |
| 10 | “Dùng ưu đãi lợi nhất trong danh sách này.” | VOUCHER / CHOOSE_VOUCHER | Select canonical eligible voucher | Apply an invented/ineligible code | Exact voucher identity and eligibility |
| 11 | “Giao tận nơi giúp mình.” | FULFILLMENT / SET_FULFILLMENT | Explicit delivery; request needed destination | Set COD from fulfillment evidence | Fulfillment facet; payment unchanged |
| 12 | “Đường Nguyễn Văn Linh, phường Tân Phong.” Then “Số nhà 25, quận 7 nhé.” | LOCATION / address follow-up | Merge authoritative address components or clarify | Treat component as unrelated new address | Location continuation and candidate fingerprint |
| 13 | “Đúng địa chỉ đầu trong hai địa chỉ đó.” After geo ambiguity. | LOCATION / SELECT_LOCATION_CANDIDATE | Reuse selected coordinates; compatible branch flow | Regeocode guessed ID or choose profile address | Same candidate ID/coordinates; no ORDER_HISTORY completion |
| 14 | “Quán có những cách thanh toán nào?” | PAYMENT / READ_PAYMENT_OPTIONS | Information only | Commit payment or rebuild confirmation | Read primary question; payment unchanged |
| 15 | “Mình không trả tiền mặt đâu.” | PAYMENT / noncommitting choice | Preserve unset/previous method; clarify valid choice | Default COD or infer alternate payment | NEGATED never upgrades to COMMIT |
| 16 | “Mình chọn chuyển khoản QR.” Only if offered. | PAYMENT / SET_PAYMENT | Explicit canonical payment | Fulfillment evidence reused for payment | Payment facet and state milestone |
| 17 | “Cho mình kiểm tra lại đơn trước khi chốt.” | CHECKOUT / PREPARE_CHECKOUT | Fresh summary/action ID | Create order immediately or hide missing fields | Summary fingerprint and prerequisites |
| 18 | “Thông tin đúng rồi, xác nhận đặt đơn nhé.” Later turn after fresh summary. | CHECKOUT / CONFIRM_CHECKOUT | Exactly one confirmed order | Replay write or silently prepare a replacement summary | Prior-turn action/fingerprint; idempotency |
| 19 | “Xem đơn vừa đặt, mình muốn đổi món đầu thành hai phần.” | ORDER_READ + ORDER_CHANGE / detail + prepare update | Owned-order preview; ask later confirmation | Edit draft cart, unknown nested fields or immediate commit | Closed update schema; order-line identity; preview only |
| 20 | “Khoan, quán có chính sách đổi đồ uống thế nào?” Separate scenario with a pending product. | RAG_KNOWLEDGE / safe interrupt + ASK_KNOWLEDGE | Answer approved FAQ or truthfully lack evidence; retain draft | Auto-resume purchase, invent policy | Scoped FAQ progress; pending state unchanged |

`LIVE_PROVIDER_REQUESTS = 0`
