# Final natural conversation context + reference hardening report

Date: 2026-10-01, Asia/Ho_Chi_Minh.

Status: source-confirmed non-voucher defects implemented and verified. No commit or push was performed. The full authenticated three-scenario E2E was not run because `E2E_EMAIL` and `E2E_PASSWORD` are unavailable in the Codex environment. Live read-only S1/S3 chains were verified through the rebuilt gateway.

## A. Starting source and runtime

- Branch: `branch_thaian`.
- Starting local HEAD: `89a8d3d62d04515aacb19c736e771a699c00ff07`.
- Fetched `origin/branch_thaian`: `89a8d3d62d04515aacb19c736e771a699c00ff07`.
- Fetched `origin/main`: `dc872e72ba29cac71b2395763a6776b7e6719f35`.
- Initial worktree: clean.
- External harness: `/Users/thaian/Desktop/avengers_e2e_natural_rag_3_scenarios.py`, 1,148 lines, SHA-256 `d0e6f036502e4e112086649c35a85260fb5be88c57daf6194fba9dea04217c07`.
- The initial Docker AI image differed from the checkout only in `src/agents/pending_context.py`, proving the 18:44 voucher evidence used stale runtime source.
- Voucher code was frozen. No voucher classifier, voucher tool, or voucher business logic was changed.
- Final AI container: `57896ad37dabf41f6df19305c62f02d636e3f39108fd8326c2d00cd1e5f8d53b`, image `sha256:fc5e058c72e2976025267bd227a406550032b1824c6cbe9ed724e55be487fcaf`, started `2026-10-01T12:39:02.098987338Z` (19:39:02 local). It runs one Uvicorn process with no source mount. All 48 `/app/src` Python files match the edited checkout.

## B. Source-confirmed root causes

1. `run_order_flow()` returned successful read-only consultation before LangGraph. The RAG lane resolved a canonical product but did not return that identity to orchestration, so `last_product_focus` was never updated.
2. Review, price, and inventory handlers already worked with a canonical focus. Their observed failures were downstream effects of missing identity. Terse `bn` also needed normalization to the existing price authority vocabulary.
3. `_resolve_product_ordinals()` maintained a second product-specific grammar. It could parse explicitly namespaced product ordinals but could not safely consume positive coordinated bare references such as `chọn 1 và 3` against an active product snapshot.
4. Multi-product price/option preparation could leave an arbitrary single focus from the final price lookup. Multi-selection must keep focus unset.
5. The 18:44 voucher failure was stale-runtime evidence. Current source classifies the supplied rejection as `SKIP_VOUCHER`, and all current voucher regressions pass.

## C. Files changed

Production:

- `avengers-coffee-system/services/ai-service/src/agents/knowledge_consultation.py`
- `avengers-coffee-system/services/ai-service/src/agents/order_flow_graph.py`
- `avengers-coffee-system/services/ai-service/src/agents/selection_language.py`
- `avengers-coffee-system/services/ai-service/src/function_calling/tools/knowledge_tools.py`
- `avengers-coffee-system/services/ai-service/src/rag/authority.py`
- `avengers-coffee-system/services/ai-service/src/rag/product_context.py`

Tests:

- `avengers-coffee-system/services/ai-service/tests/test_canonical_conversation_references.py` (new, 50 tests)
- `avengers-coffee-system/services/ai-service/tests/test_natural_knowledge_routing.py`
- `avengers-coffee-system/services/ai-service/tests/test_rag_v2.py`

No Order Service, frontend, `pending_context.py`, voucher tool, or external harness file changed.

## D. Canonical focus design

The read-only lane returns private `_canonical_reference` metadata containing an existing canonical product row and its source. `run_order_flow()` removes that metadata before the public response and persists only `{product_id, product_name, category}` through the existing `last_product_focus` contract.

Reference precedence is explicit current-turn canonical name or ordinal, then a single staged product, then UI-selected product ID, then existing focus, then a single visible product snapshot. Explicit ambiguity or unknown product wording returns no canonical identity and cannot silently reuse stale focus. Full-name matching evaluates the current catalog together with stored context, preventing an older shorter focus from capturing a longer explicit product name.

Focus is conversational identity only. It does not call cart, voucher, checkout, or order mutation handlers. Existing transactional pending owners remain intact. Insufficient RAG grounding preserves identity while keeping the answer insufficient.

## E. Multi-ordinal design

The product resolver now consumes `parse_selection_reference(..., active_namespace="PRODUCT", allow_multiple=True)` and maps its ordinals to the existing canonical snapshots. The shared parser supports coordinated positive selections while preserving original user order and de-duplicating repeated products at the resolver boundary.

Bare ordinals require an active product snapshot, positive selection semantics, and no competing pending owner. Explicit voucher, payment, fulfillment, branch, location, cart-line, mixed namespaces, street numbers, negation, quantities, and out-of-range ordinals do not become product selections.

Resolved products continue through `_prepare_structured_products`, `get_product_options`, `pending_products`, `fill_options`, default completion, authoritative `add_to_cart`, and existing operation IDs. The staged-batch default follow-up is recognized before catalog search, so it operates on the stored canonical products. Multi-selection and multi-price preparation leave `last_product_focus` unset.

## F. Explainability and provenance

The existing `[AgentTurn]` logger and turn-log state now receive a compact `decision_provenance` object with:

- `authority_owner`
- `active_pending_type`
- `reference_namespace`
- `reference_source`
- `resolved_product_ids`
- `semantic_operation`
- `mutation_allowed`
- `provider_tools`
- `mutation_evidence_present`

The trace records routing evidence and service ownership. It contains no model reasoning and is not returned to customer-facing responses. Logging failure is fail-safe and cannot alter a business turn.

Live examples from the rebuilt container:

- Named description: `authority_owner=rag`, `reference_source=explicit_product_name`, `resolved_product_ids=[3]`, `mutation_allowed=false`.
- Deictic review: `authority_owner=review`, `reference_source=last_product_focus`, `resolved_product_ids=[3]`, provider `get_product_insights`.
- Terse price: `authority_owner=price`, `reference_source=last_product_focus`, `resolved_product_ids=[3]`, provider `check_price_and_stock`.
- Ordinal description: `authority_owner=rag`, `reference_source=product_snapshot_ordinal`, `resolved_product_ids=[122]`, `mutation_allowed=false`.

## G. Tests added and updated

The 50 new tests cover:

- named, ordinal, and UI-selected read-only focus;
- insufficient evidence with retained identity;
- deictic review, terse price, and inventory authority;
- deictic add with option staging;
- explicit identity override, unknown identity, ambiguous alias, longer-name precedence, and visible-list no-guess rules;
- natural coordinated ordinal forms, original order, de-duplication, and out-of-range handling;
- voucher/payment/fulfillment/branch/location/cart-line/address/negation collisions;
- pending-owner isolation for voucher, payment, checkout, branch, location, cart-line, and options;
- staged default completion without a new catalog search;
- configurable and fixed-default multi-product add behavior;
- exactly-once replay behavior;
- no arbitrary single focus after multi-selection;
- structured provenance and fail-safe logging.

Two old test modules were updated only to express the new state distinction: business state remains frozen, while canonical conversational focus may change.

## H. Mutation-safety proof

- Read-only tests replace cart, voucher, branch, checkout, and order write functions with exceptions; canonical focus tests pass without invoking them.
- Business-state snapshots exclude only `last_product_focus` and timestamp, then compare every remaining cart, voucher, quote, checkout, pending-product, and pending-owner field.
- Read-only live turns emitted `mutation_allowed=false` and `mutation_evidence_present=false`.
- Configurable multi-selection produced `pending_products` and `fill_options` with zero cart writes until defaults/options were completed.
- Replaying the same `client_message_id` did not add products twice.
- No voucher production file changed; the current 47-test voucher-negation module remains green.

## I. Verification results

- Focused AI suites: **740 passed**, one existing LangGraph deprecation warning, 6.91 seconds.
- Full AI suite: **1,514 passed**, one existing LangGraph deprecation warning, 9.65 seconds.
- Order Service: **11 suites passed, 108 tests passed**, 3.14 seconds.
- Order build: `npm run build` passed.
- Python syntax compilation passed using a sandbox-writable bytecode cache.
- `git diff --check` passed.

## J. Hardcoding and scope audit

- No E2E sentence, product ID/name, address, location, branch, or voucher phrase was added to production.
- The existing product-specific ordinal regexes were removed from `order_flow_graph.py`; numbered product resolution now uses the shared parser.
- No new model/LLM router was introduced.
- RAG grounding remains strict and observational.
- Options and authoritative cart boundaries remain in the existing pipeline.
- No cart double-write path or voucher edit was introduced.
- Repository search found two pre-existing `Americano Mơ` examples in `agent_service.py` and `product_tools.py`; neither line was changed by this pass.

## K. Live verification

Read-only live gateway verification passed on the rebuilt/current source:

1. `americano mơ vị sao b` resolved canonical product `3` through RAG.
2. `món này review sao?` returned the review-owned response for Americano Mơ.
3. `giá bn?` returned `65.000đ` for Americano Mơ with no review prose.
4. Food browse produced an eight-product canonical snapshot.
5. `bánh số 2 vị sao?` resolved product `122`; grounding stayed honestly insufficient.
6. `món đó review sao?` targeted product `122`.
7. `giá bn?` returned `119.000đ` for product `122`.

The full authenticated three-scenario E2E is **NOT RUN** because credentials are unavailable. This blocks live voucher/cart/order acceptance only; deterministic implementation verification is complete.

Manual one-line command (replace placeholders locally; do not paste the password into chat):

```bash
cd '/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI/avengers-coffee-system/services/ai-service' && E2E_EMAIL='YOUR_EMAIL' E2E_PASSWORD='YOUR_PASSWORD' .venv/bin/python '/Users/thaian/Desktop/avengers_e2e_natural_rag_3_scenarios.py'
```

## L. Residual risks

- Authenticated live cart mutation, voucher skip, checkout, and real COD order creation still require the manual three-scenario run.
- Guest authentication correctly prevents using a guest session to prove transactional option staging or cart writes over HTTP.
- RAG output remains provider-dependent, but identity resolution and strict insufficient-evidence behavior are deterministic and separately tested.
- `cart_manager` remains in-process memory backed by persistence as documented by the existing service; no storage architecture was changed.

## M. Exact git status

Modified tracked files:

```text
avengers-coffee-system/services/ai-service/src/agents/knowledge_consultation.py
avengers-coffee-system/services/ai-service/src/agents/order_flow_graph.py
avengers-coffee-system/services/ai-service/src/agents/selection_language.py
avengers-coffee-system/services/ai-service/src/function_calling/tools/knowledge_tools.py
avengers-coffee-system/services/ai-service/src/rag/authority.py
avengers-coffee-system/services/ai-service/src/rag/product_context.py
avengers-coffee-system/services/ai-service/tests/test_natural_knowledge_routing.py
avengers-coffee-system/services/ai-service/tests/test_rag_v2.py
```

Untracked files:

```text
FINAL_NATURAL_CONTEXT_REFERENCE_PREFLIGHT_REPORT.md
avengers-coffee-system/services/ai-service/tests/test_canonical_conversation_references.py
```

No commit or push was performed.
