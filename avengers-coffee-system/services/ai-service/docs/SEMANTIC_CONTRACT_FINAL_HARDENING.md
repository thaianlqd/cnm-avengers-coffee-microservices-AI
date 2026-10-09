# Final customer chatbot semantic contract hardening

## 1. Starting HEAD

Branch `branch_thaian`; starting and unchanged HEAD `60a88e37822c02715b9f177a40bf5a20c7d3e1ff` (`chatbot`). The historical rollback reference was not used. Changes remain in the working tree.

## 2. Local changes at start

The worktree and index were clean, and the branch matched its upstream. Status, branch, HEAD, eight commits, unstaged diff and staged diff were checked before edits. Only `avengers-coffee-system/services/ai-service` was edited. No DataPlatform files, containers, volumes or credentials were changed.

## 3. Root architectural problems

The audit preceded implementation. The provider saw an executor enum beside a merged argument object, while the server later enforced the chosen executor's narrower schema. Thus a syntactically allowed proposal could express an option read plus configuration fields. Missing discovery scope became `all`; separate provider calls could execute before all siblings were journaled; repaired proposals left stale reference projections. Nested order changes permitted unknown properties and passed unknown keys through. A broad unresolved-display fallback asked a comparison question in unrelated flows. Product reviews could resolve fuzzy names by popularity; review text lacked the shared RAG projection.

Existing canonical destination binding, separate checkout facets, cart ownership, later-turn confirmation, business fingerprints, provider budgets and durable replay protection were retained. The audit covered the semantic gateway, planning, capability inventory, context/memory, presentation, checkout/destination, order preview, provider continuation/retry, cart authority, function tools and retrieval boundaries. The static source inventory is an over-approximation of default candidates, not a proof of arbitrary program behavior.

## 4. Old semantic contract

`customer_actions.actions[] = {tool: enum(executors), args: union(unrelated fields), commitment, evidence, reference, ...}`. Business validation protected side effects but could not make provider generation reliable. The merged schema generator has been removed. `customer_actions_schema(model_facing=True)` now fails explicitly.

## 5. New semantic operation registry

`src/agents/semantic_registry.py` defines 48 customer-meaning operations. Each supplies an exact closed schema, access, namespace, target requiredness, commitments, facet, mapping, required meaning, omission policy, business preconditions and repair classification. The same object generates schemas, validates wire proposals, maps fields/fixed arguments, filters exposure, produces repair instructions and drives the contract matrix. Its 56 optional top-level fields have individual omission policies in the static audit.

READ functions are intrinsically nonmutating and have no commitment/evidence fields. WRITE functions require current-turn exact evidence and an allowed committing state. FINAL_WRITE permits AFFIRMED only. Social interaction uses the structured final response without a business operation.

## 6. Flat union versus exact schemas

The provider receives functions such as `semantic_select_product`, `semantic_configure_product`, `semantic_ask_product_options`, `semantic_set_payment` and `semantic_set_fulfillment`. Parameters are top-level customer meaning, without `tool` or `args` selectors. Every object, including references and nested order options, has `additionalProperties=false`. No oneOf/if/then provider dependency was introduced.

`ASK_PRODUCT_OPTIONS` has a product reference and cannot accept size, ice, sweetness, quantity changes or payment. `CONFIGURE_PRODUCT` owns supplied configuration fields. Namespace is injected by the registry; the provider cannot change it. Reference conditional grammar and numeric types are validated server-side before execution.

An unadvertised migration adapter remains for existing internal callers and legacy fixtures. It validates the exact selected business schema, never a merged schema. It is not the model-facing semantic contract. Compatibility adapters and the explicit nonsemantic lane are retained; deleting them would be a separate migration.

## 7. Semantic operation to business executor mapping

All functions use the `semantic_` prefix plus the lower-case operation name. Product SELECT is a semantic draft WRITE even though its authoritative option reader is a business READ. The table is generated from the registry; required commitment/evidence fields appear only for writes.

| Operation | Executor | Access | Namespace / facet | Required fields |
|---|---|---|---|---|
| DISCOVER_PRODUCTS | filter_catalog | READ | MENU_CATEGORY / discovery | scope |
| RECOMMEND_BY_PREFERENCE | get_recommendations | READ | session / preference | scope, concepts |
| RANK_BY_SALES | filter_catalog | READ | session / rank_by_sales | scope, period |
| RANK_BY_PRICE | filter_catalog | READ | session / rank_by_price | scope, direction |
| DISCOVER_NEW_PRODUCTS | filter_catalog | READ | session / discover_new_products | scope |
| RANK_BY_RATING | get_recommendations | READ | session / rank_by_rating | scope |
| READ_MENU | get_menu_categories | READ | session / menu | none |
| SELECT_PRODUCT | get_product_options | WRITE | PRODUCT / product_selection | commitment, evidence, reference |
| ASK_PRODUCT_OPTIONS | get_product_options | READ | PRODUCT / product_options | reference |
| CONFIGURE_PRODUCT | add_to_cart | WRITE | PRODUCT / product_configuration | commitment, evidence |
| USE_PRODUCT_DEFAULTS | add_to_cart | WRITE | PRODUCT / product_defaults | commitment, evidence |
| DISCARD_PRODUCT_SELECTION | discard_pending_product | WRITE | PRODUCT / discard_product_selection | commitment, evidence, reference |
| ASK_PRODUCT_FACT | get_product_description | READ | PRODUCT / product_fact | facet, reference |
| ASK_PRODUCT_REVIEW | get_product_insights | READ | PRODUCT / review | reference |
| ASK_PRODUCT_PRICE | check_price_and_stock | READ | PRODUCT / price | reference |
| ASK_KNOWLEDGE | search_knowledge_base | READ | session / knowledge | query, domain |
| READ_CART | get_cart | READ | session / read_cart | none |
| READ_CART_TOTAL | get_cart_quote | READ | session / read_cart_total | none |
| UPDATE_CART_LINE | update_cart_item | WRITE | CART_LINE / update_cart_line | commitment, evidence, desired_state, reference |
| REMOVE_CART_LINE | remove_cart_item | WRITE | CART_LINE / remove_cart_line | commitment, evidence, reference |
| FINISH_CART | finish_cart | WRITE | session / finish_cart | commitment, evidence |
| READ_ELIGIBLE_VOUCHERS | get_applicable_vouchers | READ | session / read_eligible_vouchers | none |
| CHOOSE_VOUCHER | apply_voucher | WRITE | VOUCHER / choose_voucher | commitment, evidence, reference |
| SKIP_VOUCHER | skip_voucher | WRITE | session / skip_voucher | commitment, evidence |
| REMOVE_VOUCHER | remove_voucher | WRITE | session / remove_voucher | commitment, evidence |
| READ_PAYMENT_OPTIONS | get_payment_options | READ | session / read_payment_options | none |
| SET_PAYMENT | set_payment_choice | WRITE | PAYMENT / payment | commitment, evidence, reference |
| SET_FULFILLMENT | set_fulfillment_choice | WRITE | FULFILLMENT / fulfillment | commitment, evidence, reference |
| READ_PROFILE_ADDRESSES | get_user_profile | READ | session / read_profile_addresses | none |
| RESOLVE_NEW_LOCATION | resolve_location | WRITE | LOCATION / resolve_new_location | commitment, evidence, kind, for_checkout, reference |
| SELECT_PROFILE_ADDRESS | resolve_location | WRITE | PROFILE_ADDRESS / select_profile_address | commitment, evidence, kind, for_checkout, reference |
| SELECT_LOCATION_CANDIDATE | select_location_candidate | WRITE | LOCATION_CANDIDATE / select_location_candidate | commitment, evidence, reference |
| FIND_NEARBY_BRANCHES | find_nearest_branch | READ | session / find_nearby_branches | location |
| READ_BRANCHES | ask_branch | READ | session / read_branches | none |
| SELECT_BRANCH | set_session_branch | WRITE | BRANCH / select_branch | commitment, evidence, reference |
| READ_BRANCH_RATINGS | get_top_rated_stores | READ | session / read_branch_ratings | none |
| ASK_BRANCH_REVIEW | get_store_reviews | READ | BRANCH / ask_branch_review | reference |
| COMPARE_BRANCH_REVIEWS | compare_branch_reviews | READ | session / compare_branch_reviews | branch_ids |
| PREPARE_CHECKOUT | request_checkout | WRITE | session / prepare_checkout | commitment, evidence |
| CONFIRM_CHECKOUT | confirm_checkout | FINAL_WRITE | session / confirm_checkout | commitment, evidence |
| READ_ORDER_HISTORY | get_order_history | READ | session / read_order_history | none |
| READ_ORDER | get_order_details | READ | ORDER / read_order | reference |
| TRACK_ORDER | track_order_status | READ | ORDER / track_order | reference |
| PREPARE_ORDER_CANCEL | cancel_order | WRITE | ORDER / prepare_order_cancel | commitment, evidence, reference |
| PREPARE_ORDER_UPDATE | update_order | WRITE | ORDER / prepare_order_update | commitment, evidence, reference |
| PREPARE_REORDER | reorder_order | WRITE | ORDER / prepare_reorder | commitment, evidence, reference |
| CONFIRM_ORDER_CHANGE | confirm_order_change | FINAL_WRITE | session / confirm_order_change | commitment, evidence |
| DISCARD_ORDER_CHANGE | discard_order_change | WRITE | session / discard_order_change | commitment, evidence |

## 8. State-specific capability exposure

The existing state/permission capability policy computes allowed business authorities; the registry translates only those into semantic functions. Pending drafts unlock configuration/default/discard operations; voucher state controls skip/apply/remove; visible provider candidates unlock candidate selection; branch candidates and fulfillment gate branch selection; complete checkout gates summary; a prior action exposes confirmation. Reads preserve menu, knowledge, branch and order interruptions. Named product selection can ground through Menu without prior display.

Exposure is permission to propose, never permission to mutate. The gateway refreshes business state, validates identity and preconditions, and checks confirmation again. Static authenticated examples expose 21–38 functions, not all 48. The broad interruption surface is a remaining size tradeoff, detailed in section 26.

## 9. Default and scope audit

The source-wide AST inventory covers agents, common runtime, function tools and RAG. It records parameter defaults, two-argument `.get` calls and `or` expressions, including logical disjunctions that are not defaults. The per-operation omission policies are the authoritative classification for the model-facing boundary; the raw candidate inventory preserves source/line/expression for review.

A = safe business/structural default; B = explicit neutral semantic value; C = unsafe silent semantic choice, removed or blocked in the typed lane.

| Default family | Classification and boundary |
|---|---|
| Missing discovery/recommendation/ranking scope | C removed: schema requires drink/food/all; gateway rejects missing category before normalization. |
| Explicit scope=all | B: explicitly unrestricted meaning, never inferred from omission. |
| Sales period / price direction | C removed: sales period and price direction required by their operations. Optional anchor uses current Vietnam calendar within that period (A). |
| Preference basis | C removed: operation fixes description preferences; concepts required. No implicit hot/bestseller substitution. |
| Payment / fulfillment | C prohibited: required canonical references in separate operations. None means unchosen. Existing authoritative choice may be restored (A), never invented. |
| Voucher decision | C prohibited: reads leave decision unchanged. Finish opens the gate. Apply/skip/remove require their own current decision. |
| Location / saved profile address | C prohibited: reads/offers do not confirm. Literal, profile and provider-candidate operations remain distinct. |
| Branch | C prohibited: no arbitrary first candidate for pickup/dine-in. Existing server delivery-nearest-branch policy may choose an inventory-verified serving outlet for an explicitly confirmed destination (A); this is not pickup choice. |
| Product / order target | C prohibited: typed references are required. No hottest product; RECENT order is explicit reference meaning. Omitted configure target binds only a unique selected pending product (A). |
| Product quantity | A: one unit for a newly explicitly selected product; retain existing selected draft quantity on follow-up. Read limits do not authorize quantity changes. |
| Product options | A: retain selected values; Menu supplies only legitimate optional/fixed defaults. Required choices stay pending. Full defaults/reset require USE_PRODUCT_DEFAULTS and current evidence. |
| Cart removal quantity | A: omission removes the explicitly targeted whole line; supplied quantity subtracts units. |
| Read count / optional filters | A: bounded pagination, usually 5; no family means no narrower filter within explicit scope. Omitted optional price bound means no bound. |
| Order fields / reason | A: omitted facets remain unchanged; an empty edit is rejected. No unknown key reaches preview. |
| Empty lists/maps, absent state, timeouts, cache/replay counters, formatting fallbacks | A: structural runtime defaults, not customer selections; absent required authority fails closed. |
| Legacy lower-executor category=all, sales month/hot, legacy language/flow defaults | Not typed semantic authority: required scope/basis/period are injected before calling them; semantic_mode=False compatibility retains its existing behavior. |

The retained lower-level and legacy defaults are not newly exposed provider fields. Named canonical Menu lookup deliberately searches across categories for the supplied name; this resolves one product identity and does not broaden a recommendation scope.

## 10. Product selection and configuration

SELECT_PRODUCT resolves a canonical Menu name/reference, reads options and stages a draft; it does not add to cart. ASK_PRODUCT_OPTIONS reads without staging. CONFIGURE_PRODUCT accepts only currently supplied values and merges previous choices and quantity. Optional/fixed Menu defaults can fill legitimate gaps; required choices remain pending. USE_PRODUCT_DEFAULTS records explicit default authorization; CORRECTION resets prior draft options. Each product has its own pending identity/options. No model price is accepted.

## 11. Recommendation design

RECOMMEND_BY_PREFERENCE requires explicit scope plus 1–4 independent concepts; optional family and requested count are distinct. The server constructs preference_query/preference_concepts and fixes criteria=preferences. Approved menu descriptions provide suitability evidence, and current active Menu validates identity/scope/price. The typed lane does not reclassify a single taste concept as a product-name lookup. Missing evidence does not produce bestsellers or an ingredient/allergen safety claim. Name purchase uses Menu identity, not description retrieval.

## 12. Compound cart plan

The provider loop sends all calls in one semantic assistant response to the gateway before any member executes. Wire shapes are validated together, a server SemanticPlan assigns action IDs/dependencies, canonical targets are bound, and entry cart ordinals are frozen. A malformed sibling prevents initial writes. Execution is conservatively ordered and stops at unresolved/confirmation boundaries.

Repair replaces one failed proposal only. Operation/facet cannot change; separately valid references on malformed proposals are retained and bound, including product and payment targets. Literal-location repair preserves the original address value. A repair cannot change an already bound target. Siblings, successful writes, action IDs and dependencies survive; reference/proposal/facet projections are refreshed and stale results cleared. Existing operation IDs and durable client_message_id fences prevent replay. Tests cover removal then quantity/options updates, reversed orders, duplicate products/lines, partial success and repair.

## 13. Payment and fulfillment

Two exact operations map to separate setters. Fulfillment cannot carry payment and vice versa. Payment aliases are server-owned vocabulary on the canonical inventory: COD/cash, QR/QR ngân hàng, Ví/Ví Avengers, VNPAY. Grounding matches aliases rather than scanning raw user sentences. Enabled/eligibility state remains authoritative, including wallet checks. Current-turn evidence is provenance only; it is not a second NLU engine.

## 14. Location identity

RESOLVE_NEW_LOCATION uses a literal reference with explicit kind and for_checkout. SELECT_PROFILE_ADDRESS uses canonical saved-address candidates and the existing later-turn saved-offer policy. SELECT_LOCATION_CANDIDATE uses the provider candidate ID. Confirmed destination retains candidate_id, provider_ref_id, display_address, coordinates, source and fingerprint. Profile reads and branch consultation cannot overwrite it. Summary and confirmation fail closed on drift. Address syntax parsing remains structural; a POI needs delivery precision rather than silent profile substitution.

## 15. Voucher design

Eligible-voucher reads do not apply or decide. FINISH_CART opens the voucher gate. CHOOSE_VOUCHER grounds code/name/ordinal/best against authoritative eligibility/savings. SKIP_VOUCHER and REMOVE_VOUCHER require explicit decisions. Cart changes retain existing revalidation rules. Generic acknowledgment cannot skip a voucher or manufacture a discount.

## 16. Existing orders

History/details/status reads remain session-owned. Canonical order targets are grounded from owned snapshots, explicit recent meaning or literal UUID subject to service ownership. Cancellation/edit/reorder prepare previews only. Closed changes/add_items/options schemas reject unknown keys before details/preview. Field mapping is explicit; the key-preserving passthrough was removed. Reorder validates current products/options/prices and later appends to cart; it does not create/pay an order. CONFIRM_ORDER_CHANGE is FINAL_WRITE; discard affects only the preview.

## 17. Confirmation and fingerprints

Summary is not order creation. Checkout confirmation requires an explicit AFFIRMED current message against a prior-turn fresh action. The fingerprint binds line identity, product/options, quantity, individual current prices, voucher/discount, fulfillment, immutable destination, branch, payment, fees and total. Offsetting price changes still invalidate it. Order previews bind target/payload/revision/expiry and require later confirmation. Same client_message_id returns the prior receipt; uncertain mutations use reconciliation rather than blind replay.

## 18. Protocol repair

Missing required fields, cross-operation arguments, malformed JSON/references and unexpected namespaces are MODEL_PROTOCOL with model_repair recovery. Registry feedback supplies repair_function, exact repair_parameters, required fields and the failed action. Meaning/operation/facet/grounded target and siblings are locked. Repair remains within the existing bounded inference loop and provider accounting. Gemini opaque continuation metadata is preserved. No unconditional classifier or extra inference stage was introduced.

## 19. Error taxonomy and deterministic fallback

`semantic_errors.py` centrally classifies structural results into MODEL_PROTOCOL, CUSTOMER_AMBIGUITY, BUSINESS_PRECONDITION, BUSINESS_REJECTION, PROVIDER_FAILURE, CONFIRMATION_STALE, AUTH_REQUIRED and CANONICAL_TARGET_MISSING. It reads statuses/recovery fields, never customer language. Protocol faults receive an assistant interpretation/retry message, not a claim that the customer omitted information. Partial committed cart state remains visible without replay or false success for the unfinished part. Business-required options/payment/address and genuine canonical ambiguity retain their specific guidance.

Arbitrary unresolved product display no longer emits comparison-specific copy. The legacy lane alone retains a count question for exactly two verified complementary price-ranking batches. Typed protocol exhaustion requests a retry based on authoritative state. Existing deterministic transactional presentation and factual claim validators still constrain price, totals, discount, quantity, address, branch, payment, order status and mutation claims. Provider outages retain bounded retry guidance.

## 20. RAG/review trust boundary

`src/rag/untrusted_data.py` supplies the shared evidence predicate and review projection. It filters instruction-shaped system/secret/tool requests while retaining legitimate comments/ratings. Knowledge tools reuse it; business review results are filtered before model/public projection. This is data sanitization, not semantic routing. The gateway remains the final write boundary even if hostile text survives lexical filtering. Product insights now require an exact or unique active Menu match; multiple fuzzy matches return canonical ambiguity before review queries. No popularity-based product choice remains in that query.

## 21. Files changed

- `docs/SEMANTIC_CONTRACT_FINAL_HARDENING.md`
- `docs/SEMANTIC_CONTRACT_QUALIFICATION.json`
- `docs/SEMANTIC_CONTRACT_STATIC_AUDIT.json`
- `scripts/audit_semantic_contract.py`
- `src/agents/checkout_choices.py`
- `src/agents/checkout_contract.py`
- `src/agents/llm_tool_orchestrator.py`
- `src/agents/order_management.py`
- `src/agents/semantic_control.py`
- `src/agents/semantic_errors.py`
- `src/agents/semantic_plan.py`
- `src/agents/semantic_registry.py`
- `src/agents/tool_artifacts.py`
- `src/agents/tool_capabilities.py`
- `src/agents/tool_policy.py`
- `src/common/agent_provider_policy.py`
- `src/common/groq_service.py`
- `src/function_calling/tools/knowledge_tools.py`
- `src/function_calling/tools/product_tools.py`
- `src/rag/untrusted_data.py`
- `tests/test_chatbot_semantic_regressions.py`
- `tests/test_description_recommendations.py`
- `tests/test_menu_identity_repairs.py`
- `tests/test_semantic_control.py`
- `tests/test_semantic_dialogue_repairs.py`
- `tests/test_semantic_registry_contract.py`
- `tests/test_semantic_state_hardening.py`
- `tests/test_typed_semantic_journeys.py`

Existing tests were migrated to the exact provider surface and explicit scope where their purpose was unrelated to missing scope. Missing-scope rejection now has its own matrix. No test functions were removed and no skip was added. New coverage comprises 220 registry/contract/fuzz cases and 14 scripted customer journeys (234 additional collected passing cases).

## 22. Exact focused test results

All stages used the existing Python 3.11 image with `docker run --rm --network none`, scripted providers, and no real environment file mounted. They ran in the requested order. Warnings are the existing dependency deprecations. Deselecting contract tests divides schema and fuzz stages; it does not skip either group in qualification or the full suite.

| Stage | Exact pytest result |
|---|---|
| 01_registry_schema | 204 passed, 16 deselected in 1.17s |
| 02_protocol_fuzz | 16 passed, 204 deselected in 0.59s |
| 03_semantic_plan | 173 passed, 1 warning in 1.45s |
| 04_product_configuration | 58 passed, 1 warning in 1.49s |
| 05_recommendation_scope | 53 passed, 1 warning in 2.28s |
| 06_compound_cart | 61 passed, 1 warning in 1.03s |
| 07_checkout_payment_location | 175 passed, 1 warning in 1.90s |
| 08_order_management | 86 passed, 1 warning in 1.14s |
| 09_rag_reviews | 57 passed, 2 warnings in 2.06s |
| 10_provider_resilience | 108 passed, 1 warning in 3.00s |

## 23. Exact full-suite results

Baseline before edits: **2887 passed, 0 failed, 1 skipped, 2 warnings in 18.49s**.

Final ordered qualification: **3121 passed, 0 failed, 1 skipped, 2 warnings in 21.04s**. Exit code 0.

The single unchanged skip is `test_agent_redis_integration.py`, which requires the explicit existing-Redis opt-in. Warnings are LangChain's pending `allowed_objects` default change and AnyIO's BlockingPortal alias deprecation. Intermediate failures were corrected, not hidden: compatibility schema/scope assertions, exact validation timing, malformed-target repair binding, and isolated scripted fixture assumptions. The final counts come from the actual run, not prior reports.

Machine-readable results and deployed source hashes: `SEMANTIC_CONTRACT_QUALIFICATION.json`. Ordered logs were retained under `/private/tmp/semantic-qualification/`; full-suite log `11_full_suite.log`. Production AST parsing and `git diff --check` passed. Tracked changes outside ai-service and removed existing test functions: zero.

## 24. Docker build

`docker compose build ai-service` succeeded (exit 0). Runtime config image digest: `sha256:7d71635853c828bae3baa8d810d63d27e7a6f348830834e816f8c705e036c0c6`.

`docker compose up -d --no-deps ai-service` succeeded (exit 0). Only `avengers_ai_service` was recreated. Compose reported pre-existing orphan containers; no remove-orphans/down/volume command was used. Build/recreate logs are `/private/tmp/semantic-hardening-docker-build.log` and `/private/tmp/semantic-hardening-recreate.log`. Six critical deployed source hashes match the workspace: registry, error taxonomy, semantic planner, gateway, provider loop and untrusted-data projection.

## 25. Health verification

Local `GET http://127.0.0.1:8000/ai/health` inside the recreated container returned **HTTP 200**, `status=ok`, `cf_trained=true`, `redis_available=true`, and `chat_orchestrator_mode=llm_tools`. The existing provider configuration was not altered or printed as secret material. The health function checks SDK/client availability and local health; it does not request a completion. No chatbot prompt, embedding, transcription or other external model call was made. The health receipt is included in the qualification JSON.

## 26. Static prompt/schema/context comparison

No token estimation or latency claim is inferred from character counts. `scripts/audit_semantic_contract.py` compares the immutable starting-HEAD schema generator with the new registry over the same representative capability sets. Baseline source was exported with git show into an offline container; no credentials or database queries are needed. Lengths use Python JSON serialization with ensure_ascii=False.

System prompt: **6386 → 5025 characters**.

| State | Old flat schema chars | Exact schema chars | Functions | Context chars | Prompt + schema change |
|---|---:|---:|---:|---:|---:|
| browsing | 7519 | 10831 | 21 | 495 | +14.0% |
| products | 8256 | 14114 | 25 | 573 | +30.7% |
| pending_product | 8341 | 14859 | 26 | 917 | +35.0% |
| cart | 9972 | 18178 | 33 | 729 | +41.8% |
| voucher | 10078 | 18855 | 34 | 834 | +45.0% |
| location | 10348 | 19829 | 36 | 921 | +48.5% |
| summary | 10680 | 20559 | 38 | 1004 | +49.9% |
| order_change | 11692 | 22384 | 38 | 815 | +51.6% |

Worst-case universal exact schema: **27104 characters / 48 functions**; this universal set is not the normal state surface. Model contexts in the synthetic states range from 495 to 1004 characters and retain the existing projection policy.

Exact declarations repeat reference/commitment structures, so schema bytes increased: this pass does **not** meet the aspirational smaller-schema goal. Read-only commitment/evidence fields and executor prose were removed to contain overhead without weakening the boundary. The safety contract was prioritized; no extra classifier call or provider send was added. Further state-surface reduction should be measured against interruption and compound-turn regressions. Character growth is a known limitation, not a live token/latency qualification.

## 27. Remaining limitations and acceptance answers

Offline fixtures prove contract, state and orchestration behavior; they cannot prove Gemini's Vietnamese interpretation or acceptance of every schema in a live account. The model can still choose a semantically wrong committing operation; exact evidence is provenance, not semantic truth proof. Business policy remains authoritative. Sanitization is defense in depth, not a complete prompt-injection detector. Live provider SDK behavior, real Menu/geo/payment/order integration and live latency are reserved for the user.

The static inventory contains **69 production modules / 2570 default candidates**; many candidates are ordinary logical expressions or serialization fallbacks. Every optional top-level semantic wire field has a registry policy; conditional reference fields follow the shared reference grammar. The inventory is intentionally retained for review rather than claiming an automatic proof that every legacy code path has no unsafe default. Legacy nonsemantic compatibility and the larger exact schema surface remain deliberate migration/performance limitations.

| Acceptance question | Answer |
|---|---|
| Can get_product_options accept configuration fields now? | **NO** — its schema is exact; ASK_PRODUCT_OPTIONS cannot serialize them. |
| Can recommendation omit scope and silently become all? | **NO** — required schema plus pre-normalization gateway gate. |
| Can fulfillment set payment? | **NO** — separate closed operations and setters. |
| Can model repair erase sibling actions? | **NO** — one failed server-plan proposal is replaced. |
| Can selected location drift to profile address? | **NO** — destination identity/fingerprint checks reject drift. |
| Can unknown update_order fields reach preview? | **NO** — closed nested validation before preview and explicit mapping. |
| Can a protocol failure blame the customer incorrectly? | **NO** — MODEL_PROTOCOL uses safe interpretation/retry guidance; genuine missing business choices remain distinct. |
| Did any production regex become new semantic authority? | **NO** — new regex is shared untrusted-data sanitization. Payment aliases are inventory grounding; names use canonical Menu matching. Existing UUID/evidence-boundary/address-syntax/legacy parsers retain their prior roles. |

## 28. Manual live-test matrix — USER ONLY, not executed

Use an authenticated test customer and valid local catalog choices. Replace example names, addresses, branches and product/line numbers with the actually displayed canonical options. Some rows branch or require fresh test state. Inspect SemanticAction evidence/commitment/namespace/grounding decision; SemanticPlan action IDs/order/status; ToolGateway guardrail/mutation evidence; and LLMToolTurn repair/final-synthesis/provider-budget fields. Never print credentials. The following natural wording is manual test data, not production routing rules.

| # | Natural turn | Goal / expected state | Forbidden mutation | Log/state invariant |
|---:|---|---|---|---|
| 1 | Chào quán, hôm nay oi quá, có nước nào mát mà hơi ngọt không? | Social + description recommendation with scope=drink. | No food expansion, selection or sales fallback. | Preference basis=product_description; category=drink. |
| 2 | Mình muốn mua một cà phê sữa đá. | Named canonical SELECT; pending draft/options. | No arbitrary product or committed cart yet. | Canonical Menu ID; selection_staged; cart unchanged. |
| 3 | Món này có những size nào vậy? | Options consultation; retain draft. | No default/add/cart mutation. | READ option operation; pending identity unchanged. |
| 4 | Lấy cỡ lớn, bớt đá và ít ngọt giúp mình. | Configure supplied values; add only when required choices complete. | No invented topping/milk or reset of prior values. | Menu labels/options and quantity in write receipt. |
| 5 | Thêm cho mình trà đào và một bánh phô mai nhé. | Two independent canonical pending selections. | No cross-product options or silent defaults. | Separate product IDs/selection indexes. |
| 6 | Trà cỡ vừa, còn bánh để theo mặc định của quán. | Configure tea; explicit defaults for cake. | No shared/default authorization across products. | Separate CONFIGURE/DEFAULTS calls and evidence. |
| 7 | Bỏ dòng đầu, dòng thứ hai đổi thành ba phần, dòng thứ ba bớt ngọt nhé. | One compound plan against original displayed cart. | No shifted ordinal target or sibling loss. | Frozen entry line IDs; each action status/write once. |
| 8 | Tạm vậy thôi, cho mình thanh toán. | FINISH opens voucher gate. | No voucher skip/payment/order creation. | voucher_offer_pending; decision unset. |
| 9 | Có mã nào dùng được với giỏ này không? | Read eligible vouchers. | No application or skip. | READ only; voucher_decided unchanged. |
| 10 | Dùng mã số hai đi; nếu không hợp lệ thì báo mình. | Separate conditional meaning correctly; choose only if actually committing. | No conditional write on guessed intent/code. | Commitment and authoritative eligibility; no silent fallback. |
| 11 | Thôi bỏ mã đang dùng, lượt này không dùng ưu đãi nữa. | Explicit remove/skip decision as permitted by current state. | No unrelated cart/payment change. | Voucher receipt and fresh quote/revalidation. |
| 12 | Giao tới nhà mình ở 35 đường Nguyễn Văn Cừ nhé. | Fulfillment only plus new literal location; incomplete components stay pending. | No payment default, saved-address substitution or invented city. | Separate fulfillment/location facets; partial address retained. |
| 13 | Ở phường vừa đổi tên thuộc Quận 5, thành phố Hồ Chí Minh. | Address component follow-up; canonical geo lookup. | No guessed provider identity/coordinates. | Address grammar + provider candidates; no confirmed destination until permitted. |
| 14 | Địa điểm thứ hai đúng rồi đó. | Select displayed provider candidate. | No profile or different branch lookup address overwrite. | candidate_id/provider_ref_id/lat/lng/fingerprint persist. |
| 15 | Mình muốn trả bằng QR ngân hàng. | Canonical explicit payment choice. | No fulfillment/address change. | Payment alias resolves to enabled NGAN_HANG_QR. |
| 16 | Nếu dùng ví thì có đủ tiền không? Mình chưa đổi nhé. | Payment/wallet question, hypothetical/negated selection. | No wallet selection or charge. | Read only; QR remains selected. |
| 17 | Đừng chọn tiền mặt cho mình. | Negative payment instruction; preserve current choice. | No COD/default/checkout. | Zero writes from NEGATED meaning. |
| 18 | Cho mình xem lại toàn bộ đơn trước khi chốt. | Prepare/re-render fresh canonical summary after gates. | No order creation or same-turn final confirm. | Destination, branch, payment, totals and fingerprint match. |
| 19 | Đúng như tóm tắt, mình xác nhận đặt đơn. | Later-turn final confirmation; create once. | No stale confirmation or write replay. | Prior action/fingerprint; stable operation ID; replay same client_message_id returns receipt. |
| 20 | Cho mình xem đơn vừa đặt, nếu sửa được thì thêm một phần bánh giúp mình. | Read owned recent details; conditional meaning must not confirm mutation. | No unowned order or automatic edit/charge. | Canonical order target; preview only when explicitly requested. |
| 21 | Mình muốn hủy đơn đó; khoan xác nhận, cho mình xem điều kiện trước. | Knowledge/status consultation or cancellation preview according to meaning. | No final cancellation now. | prepare != confirm; later turn required. |
| 22 | Món cà phê này có sữa không, khách đánh giá ra sao? À quán mở mấy giờ nhỉ? | Separate ingredient/review/FAQ reads; preserve any pending draft. | No allergy guarantee, hottest-product substitution, review instruction execution or state reset. | Exact canonical entity; approved evidence; sanitized comments; zero writes. |

Also retry with a fresh pickup/dine-in cart: choose fulfillment, read branch candidates, explicitly select one on a later turn, select payment, summary, then later confirmation. Interrupt a pending product with greetings and FAQ, then resume configuration. Decline an order preview and verify only the preview disappears. These are human-only live checks.

## 29. Provider usage

**LIVE_PROVIDER_REQUESTS = 0**

All semantic/provider qualification used deterministic fakes or scripted responses in network-disabled containers. No real prompt was sent to Gemini, Groq, OpenAI, OpenRouter, Cerebras or another model API. No real credential value or .env file was inspected, printed or changed. The user performs any subsequent human/live qualification.
