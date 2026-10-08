# Hybrid Reference Semantics V2 — 2026-10-08

This report records the original 21:06 ICT V2 checkpoint. The subsequent Menu-category regression and restoration are documented in [Hybrid Menu category repair](HYBRID_MENU_CATEGORY_REPAIR_20261008.md); that follow-up expands the corpus to 57 cases and restores the READ_MENU intent.

Implementation report for the customer shopping chatbot only. This is an incremental reliability upgrade to the existing Hybrid architecture. No general-purpose agent or language router was introduced.

## 1. Repository starting HEAD

Branch `branch_thaian`; starting HEAD `19ac766666e89fa76c33195527cdefab8c811667`. The AI-service tree was initially clean. DataPlatform already had 11 modified files and one untracked test. Their SHA-256 values were saved before implementation and checked afterward; they were not edited, staged, reset, or committed by this task.

## 2. Latest prior AI-service commit

`354e3aad443f546b7fa97b234904d15b48cc0da2` (`feat: data AI`). Earlier checkout, address, no-option product, cart presentation, cancellation, reorder, and automatic-summary fixes remain part of the baseline.

## 3. Files changed

- `src/agents/agent_context.py`
- `src/agents/agent_memory.py`
- `src/agents/hybrid_command_schema.py`
- `src/agents/hybrid_commerce_orchestrator.py`
- `src/agents/hybrid_semantic_interpreter.py`
- `src/agents/hybrid_workflow.py`
- `src/agents/product_display.py`
- `src/agents/product_snapshot.py`
- `src/agents/tool_artifacts.py`
- `src/common/cart_manager.py`
- `tests/test_hybrid_command_schema.py`
- `scripts/qualify_hybrid_customer_language.py`
- `src/agents/hybrid_diagnostics.py`
- `src/agents/hybrid_discovery.py`
- `src/agents/hybrid_provider_budget.py`
- `src/agents/hybrid_reference_repair.py`
- `src/agents/product_collections.py`
- `tests/fixtures/hybrid_customer_language_cases.json`
- `tests/test_hybrid_customer_language_contract.py`
- `tests/test_hybrid_multigroup_discovery.py`
- `tests/test_hybrid_product_reference_spaces.py`
- `tests/test_hybrid_reference_repair.py`
- `docs/HYBRID_REFERENCE_SEMANTICS_V2_20261008.md` (this report)

The only existing test assertion changed is the intent-count assertion: 31 becomes 32 because `REFINE_DISCOVERY` is additive. Existing checkout/order/location/voucher/RAG tests were not rewritten. `geo.py` and the customer frontend are unchanged. New draft keys are explicitly removed by the existing conversation-reset helper.

## 4. Original bug reproduction

The observed conversational shape is reproduced offline through the actual Hybrid entry point:

1. “hi cho tôi xem menu nước đi bạn” → display drinks.
2. “cho tôi xem menu nước và bánh đi bạn” → explicitly request and display both groups.
3. “mới có nước thôi mà bánh đâu bạn” → refresh foods while retaining the prior valid drink collection.
4. “cho tôi nước số 1 và bánh số 1 2 cái nhé b” → select drink 1 quantity 1 and food 1 quantity 2.

`test_exact_four_turn_reproduction` checks two distinct canonical products and preserves their pending options. `test_lost_namespace_recovers_in_one_customer_message` separately reproduces a primary output with two unscoped ordinal-1 references, both under legacy global numbering (`duplicate_selection`) and the new grouped display (`ambiguous_reference`). A narrow patch resolves the namespaces without changing quantities.

## 5. Root cause

The old semantic product reference had an ordinal but no product group. A mixed response already displayed local group numbers, while model context and grounding primarily exposed the global product list. “Drink 1 + food 1” could become ordinal 1 twice and bind to the same canonical product. The duplicate guard correctly rejected that unsafe representation. Removing that guard would hide the defect and authorize a wrong selection.

There was also no explicit multi-group discovery contract: `scope=all` could be a generic browse or an explicit request to cover drinks and foods. A catalog limit could consume every slot with one group. Separate group collections existed but empty refreshes did not reliably replace old results.

## 6. Architecture preserved

```text
Customer language → bounded LLM meaning → strict schema
→ immutable server reference spaces → all-reference preflight
→ existing guarded business services → server presentation
```

The LLM receives no tool list or executors. It does not own IDs, stock, prices, options, eligibility, payment availability, location precision, order ownership, confirmation freshness, mutation replay, or outcome reconciliation. Literal IDs supplied by the customer retain their existing presence and ownership checks; private IDs are not exposed in the new collection context.

The independent namespaces remain products, pending products, cart lines, vouchers, branches, location candidates, saved profile addresses, payment options, order history, and owned order lines. Product focus and last-created/focus order handles retain their existing meaning. All mutation references are bound before the first draft or business write. An unknown write outcome still escapes to the durable HTTP reconciliation boundary.

## 7. External design ideas borrowed

These are adaptations of concepts, not imported code or claims that these projects implement our exact safety contract.

- [NVIDIA Retail Shopping Assistant](https://github.com/NVIDIA-AI-Blueprints/retail-shopping-assistant): its separation of catalog retrieval, user/cart memory, orchestration, and guardrails supports the decision to keep visible collections distinct from business authority.
- [Byteline ecommerce-ai-native](https://github.com/mohitsehgal/ecommerce-ai-native): conversational filter refinement motivates preserving omitted browse criteria and applying only explicit semantic changes.
- [Agentic Commerce POC](https://github.com/IsaiLemuel/agentic-commerce-poc): separation of runtime business data, conversation state, and controlled workflow motivates explicit server reference spaces and observable execution boundaries.

## 8. External design ideas rejected

We did not adopt these repositories' multi-agent handoffs or model tool-calling loops. We did not move authoritative cart or browse state into a stateless client's submitted history. We did not inject the full catalog into prompts, authorize purchases from fuzzy search, add streaming infrastructure, or replace existing preview/confirmation gates. One interpreter and one narrow pre-write patch keep the current Hybrid ownership model.

## 9. Reference-space design

| Space | Entry authority | Reference meaning |
| --- | --- | --- |
| GLOBAL_PRODUCTS | Exact current product card list | Legacy plain ordinal; ALL_VISIBLE uses the complete frozen list |
| DRINK_PRODUCTS | Most recently valid displayed drink collection | `group_ordinal`, group `drink`, local index |
| FOOD_PRODUCTS | Most recently valid displayed food collection | `group_ordinal`, group `food`, local index |
| pending_products | Current independently numbered drafts | `pending_ordinal` / existing pending target |
| cart_lines | Current verified cart lines | `cart_ordinal` / existing cart target |
| Other namespaces | Their own entry lists and ownership rules | Existing grammar unchanged |

Name references remain exact, with canonical catalog reads where already permitted. No fuzzy or prose-derived identity was added. Group references never include hidden candidates or fresh same-turn discovery results. Truly duplicated canonical products remain rejected, rather than being combined or silently having quantities summed.

## 10. Group ordinal schema

```json
{"kind":"group_ordinal","group":"drink","index":1}
```

A selection reference may additionally carry its own `quantity`. Group is restricted to `drink|food`; index is a positive bounded integer. Missing group/index, booleans, floats, unknown fields, group plus ID/value, or group on an ordinary name/focus/ordinal are rejected. Existing lossless canonical integer-string normalization remains audited.

Scoped refs are allowed only in product selection, product information, and product-targeted knowledge requests. They are rejected in cart, pending, voucher, payment, branch, location, and order schemas. Their values are grounded against the frozen group collection, not a new catalog result.

## 11. Collection lifecycle

Each registry entry has namespace, canonical ordered rows in its corresponding visible snapshot, local/global numbers, SHA-256 fingerprint, source, and publication generation. Registry version is 2; the existing immutable snapshot wrapper remains compatible. The last-created order marker prevents a previous purchase's display from being resurrected after a completed order.

- Publishing drinks replaces the drink collection; publishing foods replaces the food collection.
- Explicitly mixed discovery refreshes both.
- An explicit empty refresh records an empty group and a fresh fingerprint. Neither global filtering nor older nonempty rows can substitute for it.
- An unrequested group retains its latest valid generation for “lúc nãy” references.
- Fingerprint disagreement invalidates that collection and fails closed.
- Checkout completion clears all three lists and browse hints. Conversation reset clears the new durable hints and suggestion fallback, while preserving the actual cart.
- Redis stores bounded hints. Under memory pressure, product collections and their metadata are discarded together rather than silently shortened. A bounded server-owned durable fallback can restore the exact previously published collections. Current business services still revalidate every write.

Unrelated read-only turns do not clear collections. Captured rows/metadata are deeply immutable JSON copies; mutating memory, catalog results, or a returned rows list cannot change the entry snapshot.

## 12. Multi-group discovery

`DISCOVER_PRODUCTS scope=all` alone remains generic browsing. Explicit coverage uses `requested_groups=["drink","food"]`. The server independently reads each requested group, validates classification from Menu metadata, removes duplicate canonical IDs, and constructs the final display. It cannot spend every slot on one group while another requested group has valid results.

Default total is 5, allocated 3/2 in declared group order. A supplied total is balanced deterministically. Sparse groups return spare total slots to the other group. Explicit `group_counts` are honored without redistribution; they must cover exactly the requested groups, sum to at most 16, and agree with an explicitly supplied total. A total below the number of requested groups is rejected.

Missing matches are reported honestly. Service failures, wrong-group results, or conflicting cross-group identities produce `DISCOVERY_COVERAGE`, invalidate the attempted group, and do not overwrite the last successful browse criteria. Results attached to a failed read are not published as verified products. Short totals or per-group counts are disclosed. Coverage and count completeness are logged, including every requested group's returned count.

## 13. Display numbering contract

`numbered_products` is shared. It always supplies `global_display_index` and `group_display_index`; newly published mixed Hybrid views put the local group number in `display_index`. Single-group views remain numbered 1..N. Text uses those group numbers, card titles use `display_index`, and card subtitles already use `group_display_index` with the group label. No frontend code change is needed.

The existing customer card code is in `apps/web-customer/src/components/ChatWidget.jsx` (title around line 235; group subtitle around lines 241–242). Product cards retain canonical IDs for authenticated UI selection. The UI fast path first verifies the clicked ID is in the frozen current card list and uses no provider. Other Menu groups remain selectable by their exact displayed name if no scoped grammar exists for that group.

Plain ordinals retain global/current-list semantics. If the current mixed display contains equally valid local ordinal-1 products, ordinary grounding returns ambiguity. The server never picks a group using regex or a default. ALL_VISIBLE selects exactly the frozen global list, without adding retained historical groups or constructing ambiguous synthetic ordinals.

## 14. Targeted repair contract

Eligible preflight failures are representation-level product reference failures for which valid displayed collections can resolve a namespace. Out-of-range numbers, empty refreshed groups, genuinely duplicated scoped selections, other business domains, and business/service/policy failures do not trigger a reference repair.

The accepted envelope is frozen. The server identifies the failed JSON-pointer paths, and the model may return only:

```json
{"reference_repairs":[
  {"path":"/commands/0/args/references/0","reference":{"kind":"group_ordinal","group":"drink","index":1}},
  {"path":"/commands/0/args/references/1","reference":{"kind":"group_ordinal","group":"food","index":1}}
]}
```

The exact failed-path set is required, without duplicates. Replacement kinds are limited to ordinary or scoped ordinals; no IDs or catalog-name guesses. Quantity is restored from the original reference. Every other command, reference, intent, order, option, payment, fulfillment, voucher action, and correction remains byte-equivalent in normalized meaning. A frozen-meaning digest is checked, the merged envelope is schema-validated, and the complete preflight runs again before execution.

Only one patch opportunity exists. Invalid, uncertain, still-ambiguous, or adversarial patches stop with a precise reference clarification showing valid group names/numbers. No successful write can be replayed by this path: repair exists exclusively before the execution block. Patch prompts contain the accepted meaning summary, failure positions/code, visible names/numbers, and newest user message; no tools, executors, private IDs, credentials, or reasoning transcript. Oversized repair context fails closed.

## 15. Provider budget

One `ProviderBudget` owns cumulative transport attempts for the whole turn. Existing provider routing/model/credential policy is reused, including failover.

| Path | Total requests |
| --- | --- |
| Successful primary meaning | 1 |
| Optional format repair or reference patch | Usually 2 |
| Format repair plus reference patch | At most 3 |
| Failover plus valid primary plus reference patch | At most 3, including failed transport attempts |
| Valid UI click or durable replay | 0 new inference requests |

Primary plus format inference retain their previous combined ceiling of 2, reserving at most one request for the reference patch. The patch cannot perform another transport retry beyond the remaining allowance. No final synthesis request exists. Offline tests use the real provider-policy wrapper with scripted transports to verify two/three-request paths and no fourth request.

## 16. Discovery-delta design

`REFINE_DISCOVERY` adds a typed semantic delta: omitted fields mean UNCHANGED, `set` means SET, `clear` means CLEAR, and `add_groups`/`remove_groups` modify only the requested groups. Conflicting operations, authority fields, contradictory price ranges, and invalid merged counts are rejected.

The last successful browse criteria are stored server-side as `hybrid_discovery_state`. A refinement needs prior state; it is merged and revalidated as a complete discovery request. Omitted query, count, price constraints, ranking, period, and exclusions survive. A change of scope removes incompatible group allocation. Explicit group add/remove preserves other filters and recomputes allocation. “Rẻ hơn” can become ascending price order without inventing a maximum budget.

Discovery state is a retrieval preference, never cart, checkout, stock, price, payment, or order authority. It creates no selected product. The main model context also exposes current pending options, cart lines, workflow milestone, focus handles, and structured product collections rather than relying on assistant prose.

## 17. Mutation safety proof

The dispatch order is unchanged: validate the entire envelope, ground all references against the entry state, optionally patch and preflight again, then enter the existing mutation-operation context. Preflight uses only reads and server-local candidate copies. Options/draft staging, cart additions/edits, checkout choices, and order previews start afterward.

The repair tests freeze accepted quantity/options/payment/fulfillment/command order; reject full-envelope or extra-path patches; show zero writes when a later branch reference fails; and prove a later business rejection cannot restart inference or replay an earlier committed addition. Replay IDs still return stored results, and unknown outcomes still require reconciliation. All existing stock, availability, authentication, verified-cart, eligibility, quote freshness, saved-address precision, owned-order, preview/confirm, and RAG evidence checks remain in their original services.

## 18. Regression results and diagnostics

New focused modules:

- `test_hybrid_product_reference_spaces.py`: closed grammar, group isolation, exact 1+2 quantities, immutable snapshots/fingerprints, plain ambiguity, old ordinals, duplicates, ALL_VISIBLE, zero-inference clicks, cart/pending isolation, and same-turn discovery exclusion.
- `test_hybrid_multigroup_discovery.py`: server allocation/redistribution, per-group limits, honest failures, invalid category rows, empty refresh, retained group, generation replacement, semantic deltas, durable restoration, completed-order and explicit-conversation resets.
- `test_hybrid_reference_repair.py`: legacy duplicate and grouped ambiguity recovery, frozen merge attacks, all-reference re-preflight, three-request format/failover paths, failed patch stop, partial-write replay, unknown-outcome propagation, and the four-turn reproduction.
- `test_hybrid_customer_language_contract.py`: all 52 labeled Vietnamese cases validate and product references ground against their labeled synthetic contexts. These tests never invoke a live model.

Structured logs: `HybridInterpretation`, `HybridReference`, `HybridReferenceRepair`, `HybridDiscovery`, `HybridTurn`, and existing dispatch/workflow events. Product reference logs include command/reference positions, kind/group/index, namespace, snapshot fingerprint, outcome, and hashed target ID. Patch logs include reason, frozen fields, changed-reference count, success, and cumulative request number. Turn logs include request, read, write and patch counts, milestone, and failure class/code.

Taxonomy distinguishes INTERPRETER_PROTOCOL, REFERENCE_GROUNDING, REFERENCE_AMBIGUITY, REFERENCE_REPAIR_FAILED, DISCOVERY_COVERAGE, BUSINESS_POLICY, PROVIDER_UNAVAILABLE, and MUTATION_OUTCOME_UNKNOWN. Process-local bounded diagnostics expose `snapshot()` counters for failed intents/kinds, duplicate and ambiguity failures, patch recovery, clarification, format-repair attempts/recovery, primary success, and business rejection. These are observability only; cross-worker aggregation remains a future log-consumer concern. No sensitive customer text or tokens are added to structured logs.

FIRST_CLICK_SUCCESS means one customer message, bounded internal repair if needed, then a correct safe action or necessary clarification without a retry caused by lost internal reference representation. Primary success, format recovery, reference recovery, necessary clarification, and business rejection remain separate measurements.

## 19. Full test-suite result

**5,837 passed, 1 pre-existing skipped, 2 dependency warnings in 34.92 seconds.** Final command: `python -m pytest -q tests`; output saved locally as `/private/tmp/reference-v2-verified-suite.log`. This includes 131 new focused tests (52 labeled utterances plus contract/safety coverage) on top of the 5,706 passing baseline tests. The offline qualification CLI also completed: 52 cases, 0 provider requests, 0 business writes, real language accuracy NOT MEASURED.

All tests run in the existing AI-service image with `--network none`, scripted transports, no real environment file/key mounts, and `PYTHONDONTWRITEBYTECODE=1`. The canonical full-suite command is `python -m pytest -q tests`. A bare root `pytest` initially collected a developer-only live-provider probe and exited during collection because no key was present; it made no provider request. That probe is not part of the `tests/` suite.

Two dependency warnings are unchanged: LangGraph checkpoint serializer pending deprecation and Starlette/AnyIO BlockingPortal alias deprecation. The one pre-existing skip remains unchanged.

## 20. Build and health result

**PASS.** `docker compose build ai-service` completed, then `docker compose up -d --no-deps ai-service` recreated only `avengers_ai_service`. Running image: `sha256:c88e021ff7f499648d091c0588bf0ba995f364003bd55d037662a5b8249a17d1`; container started at `2026-10-08T14:06:04.774157882Z` (21:06 ICT). All 16 changed runtime Python files in `/app` match the workspace SHA-256 values. Every non-AI-service container retained its original ID. Build/restart logs are in `/private/tmp/reference-v2-build.log` and `/private/tmp/reference-v2-restart.log`.

**PASS.** `GET http://localhost:8009/ai/health` returned HTTP 200: `status=ok`, `chat_orchestrator_mode=hybrid_commerce`, `agent_architecture=hybrid`, `agent_provider=gemini`, `agent_model=tier_policy`, `agent_model_tiering=true`, and `redis_available=true`. The first check used `/health` and returned 404; the verified application route is `/ai/health`. Compose emitted its existing orphan-container advisory; no orphan was removed. No chat/provider call was used for readiness verification.

Only `docker compose build ai-service` and `docker compose up -d --no-deps ai-service` are in scope. No DataPlatform or frontend rebuild/restart is needed. Source fingerprint verification compares the running image's changed runtime files with the working tree. Health is a readiness observation, not an LLM conversation evaluation.

## 21. Manual live qualification script — NOT RUN

Use a test customer and a controlled available catalog with configured drink/food options. Record actual outputs in the table; “pending” means not measured, never a presumed pass. W is actual guarded business writes; option staging is recorded separately. Test cancellation/update/reorder only against owned test orders and their existing preview/confirmation flow.

| # | Natural conversation / setup | Expected intent and spaces | Expected grounding / writes / business result | Observed requests, writes, result |
| --- | --- | --- | --- | --- |
| 1 | “xem menu nước” | DISCOVER_PRODUCTS, drink | Drink list only; W=0 | PENDING |
| 2 | “xem bánh” | DISCOVER_PRODUCTS, food | Food list; retained drink collection; W=0 | PENDING |
| 3 | “xem nước và bánh” | DISCOVER_PRODUCTS, both requested groups | Both groups if available, local numbers; W=0 | PENDING |
| 4 | After #3: “nước số 1 và bánh số 1” | SELECT_PRODUCTS, DRINK + FOOD | Distinct IDs; options staged or fixed-recipe add after checks | PENDING |
| 5 | After #3: “nước số 1 và bánh số 1 2 cái” | SELECT_PRODUCTS, DRINK + FOOD | Quantities exactly 1/2; no accidental duplicate | PENDING |
| 6 | “2 cái bánh số 1 và nước số 2” | SELECT_PRODUCTS, FOOD + DRINK | Quantities exactly 2/1 attached to own refs | PENDING |
| 7 | Mixed display: “lấy số 1” | clarification / ambiguous GLOBAL_PRODUCTS | No guessed group; W=0 | PENDING |
| 8 | Show drinks, refresh drink query to a different list, “nước số 1” | DISCOVER then SELECT, DRINK | Latest drink generation wins | PENDING |
| 9 | Show food, refresh food with genuine no-result query, “bánh số 1” | DISCOVER then unresolved FOOD | Empty fresh collection; no stale selection; W=0 | PENDING |
| 10 | Display exactly two products: “lấy cả hai món đang hiện” | SELECT_PRODUCTS ALL_VISIBLE | Exact current global list, no retained extras | PENDING |
| 11 | “món số 1 trong giỏ cho 3 cái” | EDIT_CART, cart_lines | Exact verified cart line, quantity 3, one edit | PENDING |
| 12 | Two pending products: “món đang chỉnh số 1 size L” | CONFIGURE_PRODUCT, pending_products | Only pending 1 changes; other draft retained | PENDING |
| 13 | List vouchers, “dùng voucher số 2” | CHOOSE_VOUCHER, vouchers | Revalidate eligibility; apply only selected offer | PENDING |
| 14 | Cart/branch/voucher ready: “uống tại chỗ, tiền mặt nhé” | SET_FULFILLMENT + SET_PAYMENT | Choices checked; automatic complete summary; no created order | PENDING |
| 15 | Later: “xác nhận đặt đơn” | CONFIRM_CHECKOUT | Fresh prior summary required; one owned test order, replay adds none | PENDING |
| 16 | Price-filtered browse: “rẻ hơn một chút”, “thêm bánh nữa”, “bỏ giới hạn giá” | REFINE_DISCOVERY | Omitted filters retained; explicit group add/clear only; W=0 | PENDING |
| 17 | “huỷ đơn vừa đặt giúp tôi”, then explicit preview confirmation | PREPARE_ORDER_CHANGE then CONFIRM_ORDER_CHANGE, orders | Owned/status/payment policy; cancellation only after confirmation | PENDING |
| 18 | Select owned prior order, “đặt lại đơn đó” | REORDER_ORDER, order focus | Preview only, existing later confirmation and stock/options checks | PENDING |
| 19 | “bánh số 1 có đậu phộng không?” | READ_PRODUCT_INFO, FOOD | Approved allergen evidence or honest unknown; W=0 | PENDING |
| 20 | UI click current product, repeat same client_message_id | UI fast path, current GLOBAL_PRODUCTS | Zero inference; exact visible product; no repeated write | PENDING |

For each turn retain: provider request count, semantic intent, reference namespace, grounding outcome, draft staging count, committed business write count, final milestone/result, and whether clarification was necessary. Normal inference target is 1 request, representation repair usually 2, absolute maximum 3, UI/replay 0 new inference.

The separate meaning-only harness defaults to offline:

```sh
python scripts/qualify_hybrid_customer_language.py --output /tmp/hybrid-language-contract.json
```

A future explicitly authorized run may add `--live`; it calls only the interpreter, never commerce executors. It reports intent/namespace/quantity/compound coverage and grounding metrics on the synthetic corpus. Equivalent valid outputs need human review. End-to-end first-click success and reference-repair recovery require the manual business conversations above; the meaning-only harness leaves those metrics unmeasured.

## 22. Known limitations

No real Gemini utterance accuracy, live repair recovery rate, or end-to-end first-click rate was measured. Scripted model outputs prove the contracts and guarded execution after a proposed meaning, not whether a live model will propose it. No finite offline test can certify all future natural-language interpretations.

A valid explicit name still requires the existing exact canonical lookup and business revalidation; family/fuzzy names never become authority. Empty/refused patches ask for clarification. Generic `scope=all` deliberately does not promise both groups unless meaning explicitly requests them. Other Menu groups have no new scoped-reference grammar. Counts are bounded to 16. Collections are bounded hints, fingerprints detect disagreement rather than cryptographically authenticating Redis, and current business checks remain mandatory. Diagnostics counters are process-local and reset on restart.

## 23. LIVE_PROVIDER_REQUESTS = 0

No live LLM provider was called during implementation, tests, rebuild, or health verification. All inference in regressions used scripted clients and networking-disabled test containers. The live harness and manual conversation script were not run in live mode.

## 24. Live semantic accuracy = NOT MEASURED

Offline passing cases are not Gemini language-accuracy evidence. Future metrics must be backed by labeled real provider runs and human-reviewed required clarifications. No success percentage is fabricated.

## Hard acceptance gates

| Gate | Result | Evidence |
| --- | --- | --- |
| 1. Old plain product ordinals | PASS | Existing test_hybrid_commerce references/ALL_VISIBLE and interpreter suite |
| 2. Other ordinal namespaces | PASS | Existing cart/pending/voucher/branch/location/payment/order regressions |
| 3. Distinct scoped schema | PASS | test_scoped_shape_is_closed; exact quantity selection |
| 4. Immutable entry groups | PASS | test_deep_immutability_and_collection_fingerprint |
| 5. No fuzzy/raw routing authority | PASS | Closed schema, exact ground(); no raw-language routing changes |
| 6. Drink 1 + food 1 distinct | PASS | test_exact_drink_one_food_one_quantity_attachment |
| 7. Observed reproduction fixed | PASS | test_exact_four_turn_reproduction; legacy repair recovery |
| 8. True duplicates rejected | PASS | test_truly_duplicate_scoped_product_rejected_without_repair |
| 9. Explicit available-group coverage | PASS | test_explicit_multi_group_server_allocation; wrong/unverified group tests |
| 10. Display/ground numbering agrees | PASS | Allocation test checks text and card numbers against group indices |
| 11. Plain mixed ambiguity not guessed | PASS | test_plain_ordinal_ambiguity_never_picks_group |
| 12. Latest group replaces prior | PASS | test_refreshed_group_replaces_prior_generation |
| 13. Fresh empty does not reuse old | PASS | test_empty_refresh_is_empty_while_unrequested_group_survives |
| 14. Patch only failed paths | PASS | test_only_failed_reference_is_patchable; patch scope attacks |
| 15. Meaning freeze | PASS | test_patch_preserves_accepted_compound_meaning_exactly; adversarial shapes |
| 16. Preflight precedes writes | PASS | test_repair_must_preflight_other_commands_before_writes; existing whole-envelope tests |
| 17. Normal one request | PASS | Existing interpreter/journey tests; scoped exact selection |
| 18. Reference recovery normally two | PASS | test_lost_namespace_recovers_in_one_customer_message |
| 19. Total maximum three | PASS | Format + reference and failover budget tests; failed third patch stop |
| 20. UI zero inference | PASS | test_grouped_click_is_zero_inference; other Menu group click |
| 21. Checkout safety unchanged | PASS | Existing hybrid_order_checkout_followups/live_repairs/checkout and HTTP suite |
| 22. Order change safety unchanged | PASS | Existing owned preview/confirm/cancel/update/reorder regressions |
| 23. Voucher/location/payment unchanged | PASS | Existing Hybrid journeys and policy suites |
| 24. Ingredient/allergen/RAG unchanged | PASS | Existing evidence/quarantine/ingredient/allergen suites; no guard changes |
| 25. All existing tests pass | PASS | Final full-suite result in section 19 |
| 26. New focused tests pass | PASS | Four new modules included in the final full suite |
| 27. DataPlatform untouched | PASS | All 12 starting dirty-file SHA-256 values equal after task; no DataPlatform edits |
| 28. No exact sentence hacks | PASS | Natural phrases live in corpus/tests/prompts, never production intent-routing branches |
| 29. No general-purpose agent | PASS | Existing interpreter + one narrow patch, existing guarded dispatcher |
| 30. Zero live requests | PASS | Networking-disabled tests; no live qualification executed |

## Mandatory final questions

| Question | Answer |
| --- | --- |
| Does the LLM directly call commerce tools? | NO |
| Does the LLM choose product IDs for writes? | NO; literal customer IDs retain existing validation only |
| Does the server own canonical grounding? | YES |
| Does the server own cart/checkout/order authority? | YES |
| Can drink #1 and food #1 now mean different canonical products? | YES |
| Is the reference based on what the customer actually saw? | YES |
| Can same-turn discovery retroactively create an ordinal namespace? | NO |
| Can reference repair rerun a successful mutation? | NO |
| Can reference repair change quantity/payment/fulfillment/intent? | NO |
| Can ambiguous plain #1 be guessed across multiple groups? | NO; ordinary grounding rejects it; a repair must express supported explicit scope |
| Does explicit multi-group discovery cover every requested available group? | YES, or it reports a verified empty/failed group honestly |
| Can presentation numbering disagree with grounding numbering? | NO for newly published Hybrid group references; legacy plain global semantics remain unchanged |
| Is normal provider usage still one request? | YES |
| Is total provider usage bounded at three? | YES, including failover attempts |
| Did this task weaken checkout confirmation? | NO |
| Did this task change DataPlatform? | NO; starting dirty-file contents preserved |
| Were live providers called during implementation? | NO |
| Is real Gemini natural-language accuracy proven by offline tests? | NO |
