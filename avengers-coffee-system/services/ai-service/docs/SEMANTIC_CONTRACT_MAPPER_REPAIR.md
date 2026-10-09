# Semantic contract mapper and repair qualification

## 1. Starting HEAD

Requested starting commit: `62c3a6cce7e6792992cf830a7c3abcff83a1316e` (`chan chatbot`), branch `branch_thaian`.
Historical `460e8ab` was not reset, reverted or cherry-picked.

## 2. Actual HEAD and worktree at start

Actual HEAD matched the requested commit; worktree and index were clean. Before edits, checked `git status`, branch, `rev-parse HEAD`, `log -8`, working diff and cached diff. Changes remain uncommitted in the existing branch. Scope is exclusively ai-service; DataPlatform is untouched.

Baseline was rerun with scripted providers under Docker `--network none`, without mounting real credentials or `.env`:

- Focused semantic baseline: **483 passed, 0 failed, 0 skipped, 1 warning in 4.98s**.
- Full `python -m pytest tests -q --tb=short`: **3,121 passed, 0 failed, 1 skipped, 2 warnings in 20.59s**.
- Baseline focused modules: registry contract, typed journeys, semantic control, semantic state hardening, dialogue repairs, provider resilience and Gemini guarded continuation.

Baseline logs: `/private/tmp/mapper-repair-focused-baseline.log` and `/private/tmp/mapper-repair-full-baseline.log`.

## 3. Root causes

Four structural issues were confirmed: a namespace manufactured a pending target; pre-tool formatting repair disabled the needed tools; generic discovery declared price ranking; exposure inferred semantic availability solely from shared executors. These were addressed through registry metadata and server execution/state facts, without customer-language routing.

## 4. Exact generic pending-reference bug

Old materialization used `payload.get('reference', {'kind': 'pending'})` whenever `op.namespace` existed. A valid scope/family discovery omitted its optional category reference, yet acquired a `MENU_CATEGORY/pending` reference. Grounding then asked for a nonexistent category selection. The customer had supplied a filter query, not a category entity selection.

## 5. Explicit implicit-reference design

Each `SemanticOperation` now owns `implicit_reference_kind` (default `None`), its state precondition and allowed reference kinds. Namespace permissions and operation permissions must both allow a reference. `validate_registry()` rejects undocumented implicit policies before any schema is advertised; the static audit invokes the same check.

When reference is omitted, materialization emits no reference unless the operation explicitly declares one. Typed grounding does not add another fallback reference or infer defaults authorization. The internal legacy migration adapter retains its compatibility behavior separately.

Current PRODUCT pending grounding uses current authoritative selected drafts. Ordinals retain their frozen selection indexes; pending binding cannot fall back to displayed/focused recommendations. Zero valid pending products returns `pending_product_required` / `BUSINESS_PRECONDITION`; multiple products return genuine PRODUCT ambiguity. A unique pending product supplies its canonical identity only.

## 6. Operations permitted to bind implicit pending

| Operation | Namespace | Omission meaning | Required state |
| --- | --- | --- | --- |
| CONFIGURE_PRODUCT | PRODUCT | Bind selected pending product | Exactly one canonical pending product; supplied options/quantity required |
| USE_PRODUCT_DEFAULTS | PRODUCT | Bind selected pending product | Exactly one canonical pending product; explicit current defaults commitment/evidence |

The other 46 operations have no implicit reference. Required references remain required; optional discovery reference omission means no entity target. Explicit `pending` is currently permitted only for these same two PRODUCT operations, never globally for a namespace. Menu still owns all option values and defaults. Selection and questions do not authorize defaults or cart writes.

## 7. Discovery proof

`semantic_discover_products({'scope': 'all', 'product_family': 'Synthetic family'})` validates and materializes into `filter_catalog` arguments `{category: all, search_text: Synthetic family, sort_by: menu}` with **no reference**. It reaches grounding without a category lookup or pending-category clarification, even with stale product focus.

Explicit category references remain supported: a displayed canonical category ordinal binds `category_id` and its Menu bucket. They are tested separately from scope/family filters.

## 8. Three repair modes

| Mode | Trigger from server facts | Next response | Safety boundary |
| --- | --- | --- | --- |
| PRE_TOOL_RESPONSE_REPAIR | FORMAT_REQUIRED and no tool execution log | Correct final envelope or allowed semantic call; tools available with auto choice | One format repair; repeated malformed output gives MODEL_PROTOCOL, zero writes |
| SEMANTIC_PROTOCOL_REPAIR | Invalid operation/payload retained in SemanticPlan | Repair the same function/facet/target; registry permits safe prerequisite reads for writes | One protocol repair; siblings and completed writes retained; failed READ exposes only its operation |
| POST_TOOL_FINAL_ENVELOPE_REPAIR | Existing authoritative successful evidence and final-envelope-only issue | Correct final using retained artifacts | Tools disabled, one final-envelope repair, no write replay |

`RepairMode` replaces the two overlapping format-active booleans. Existing execution locks, provider-attempt budgets, confirmation gates and idempotency remain in force. Mode transitions are logged as `[AgentRepair]`; metrics include `repair_mode`, `repair_modes` and existing repair counters. No raw utterance determines a mode.

Tests prove a malformed first business response can execute discovery or pending configuration in the same turn; malformed social output can finish without any business read; twice-malformed output is bounded and carries `error_class=MODEL_PROTOCOL` to the customer response. Protocol failure uses the controlled interpretation-failure message, preserving confirmed choices.

Post-write tests force the inference finalization path past the optional deterministic renderer: the write occurs once, the final-only request has no tools, a rogue repeated call is rejected, authoritative cart artifacts survive, and replaying the same `client_message_id` returns the stored receipt without inference. READ-then-malformed uses its single existing read result. Production retains the deterministic early completion path.

## 9. State-specific exposure

Registry exposure policies use server facts only: verified/authenticated or guest draft selection; pending product existence; saved-address candidates; visible location or branch candidates; owned-order context; order preview/draft. They are intersected with existing business capability authorization.

This separates SELECT_PRODUCT from ASK_PRODUCT_OPTIONS, and saved-address selection from literal location resolution, although they share executors. No owned order means unnecessary order mutations are absent. Profile reads may unlock saved-address selection in the same loop. Safe discovery, product questions and order-history reads remain available during interruptions; this is not a text-routed FSM. Semantic repair surfaces follow registry repair metadata and SemanticPlan state.

## 10. Discovery ordering

DISCOVER_PRODUCTS explicitly maps to neutral `sort_by=menu`. Menu SQL orders by canonical product name then product ID, with `ordering_basis=canonical_menu_name_id`. Name-filter paging keeps that deterministic order. RANK_BY_PRICE alone maps customer direction into `price_asc` / `price_desc`. Legacy executor defaults are preserved for compatibility; they are not the semantic discovery meaning. Menu's existing `new` flag ordering remains intact.

## 11. No-invented-semantics audit

The mapper has no operation-name branches. Registry metadata owns fixed args, renames, concept joining, direction mapping, selection quantity metadata, option intent and defaults evidence. `exclude_previous` and `supplied_location` are copied only when supplied. Facet comes from the payload or declared operation facet; READ commitment is structurally QUESTION. No payment, fulfillment, location, branch, voucher, product/order target, scope or confirmation is synthesized by a generic rule.

Automated provenance checks iterate **all 48 operations**, using both minimal valid payloads and optional-field variants. They assert exact mapped arguments/metadata, input preservation, closed schemas and the mandatory no-reference-on-omission invariant. The audit JSON has 48 rows including function_name, executor/access, namespace, target/reference requiredness, implicit policy/invariant, reference kinds, facet, required fields, fixed args, renames, omission policies, joins/value/metadata mappings, exposure and repair metadata. Undocumented implicit metadata fails the audit.

## 12. Operation round-trip and reference audit

All 48 operations pass provider schema → minimal valid payload → validation → materialization → real `ground_action` → target business schema validation. Canonical fixture universes supply products, cart lines, vouchers, orders, locations, saved addresses, branches, payment, fulfillment and Menu categories. These structural round trips need no business executor or external service; no fabricated-reference/namespace failure is accepted as a passing outcome.

Separate tests exercise zero/one/multiple pending drafts, explicit category selection, neutral SQL, state gates and the namespace/operation reference matrix: id/name/ordinal/focus/singleton where supported; PRODUCT pending only for configuration/defaults; ORDER recent; VOUCHER best; LOCATION literal only. Fulfillment singleton over multiple canonical methods remains genuine ambiguity. Unknown nested order patches are rejected before preview. Cross-operation fields, missing scope and negative commitments remain rejected without writes.

## 13. Changed files

Production:

- `src/agents/semantic_registry.py`: declarative reference, mapping, exposure and repair policies; registry consistency audit.
- `src/agents/semantic_control.py`: current unique pending grounding and genuine missing-draft precondition; typed path uses registry mapping only.
- `src/agents/tool_policy.py`: state-aware profile/semantic exposure and failed-operation repair surface.
- `src/agents/llm_tool_orchestrator.py`: aligned semantic instructions; propagate MODEL_PROTOCOL classification.
- `src/common/groq_service.py`: explicit repair modes, tools available before execution, locked final-only repair.
- `src/function_calling/tools/product_tools.py`: deterministic neutral Menu sort.

Qualification/documentation:

- `scripts/audit_semantic_contract.py`, `docs/SEMANTIC_CONTRACT_STATIC_AUDIT.json`.
- New `tests/test_semantic_mapper_reference_policy.py`, `tests/test_semantic_repair_modes.py`.
- Updated `tests/test_semantic_registry_contract.py`, `tests/test_semantic_dialogue_repairs.py`, `tests/test_chatbot_semantic_regressions.py`, `tests/test_typed_semantic_journeys.py`.
- This report, `docs/SEMANTIC_MAPPER_REPAIR_TEST_RESULTS.json`, `docs/SEMANTIC_MAPPER_REPAIR_RUNTIME.json`.

No existing test function was removed; no new skip was added. Assertions changed only for the requested exposure/reference/format contracts, with positive and negative checks retained or strengthened.

## 14. Ordered focused qualification

Every command below ran serially in the required order in Docker with `--network none`, `PYTHONDONTWRITEBYTECODE=1`, repository/compose/example fixtures mounted, no real `.env` or keys. Scripted fixtures supply fake responses/credentials. Full command lists and exact summaries are persisted in `SEMANTIC_MAPPER_REPAIR_TEST_RESULTS.json`; full logs are under `/private/tmp/mapper-qualification/`.

| Step | Group | Exact final result |
| --- | --- | --- |
| 01 | registry | 220 passed in 1.22s |
| 02 | mapper_reference | 276 passed in 1.02s |
| 03 | repair_state | 21 passed, 1 warning in 2.14s |
| 04 | typed_journeys | 16 passed, 1 warning in 2.53s |
| 05 | plan_compound | 255 passed, 1 warning in 2.23s |
| 06 | product_recommendation | 175 passed, 1 warning in 3.22s |
| 07 | checkout_location_payment | 377 passed, 1 warning in 3.78s |
| 08 | orders | 170 passed, 1 warning in 1.69s |
| 09 | provider_resilience | 99 passed, 1 warning in 2.00s |

Run form (from ai-service directory inside the container):

```sh
python -m pytest tests/test_semantic_registry_contract.py -q --tb=short
python -m pytest tests/test_semantic_mapper_reference_policy.py -q --tb=short
python -m pytest tests/test_semantic_repair_modes.py tests/test_semantic_dialogue_repairs.py -q --tb=short
python -m pytest tests/test_typed_semantic_journeys.py -q --tb=short
# Steps 5–9: exact module lists in SEMANTIC_MAPPER_REPAIR_TEST_RESULTS.json
python -m pytest tests -q --tb=short
```

A preliminary no-target pytest invocation tried collecting the root ad hoc Gemini diagnostic script, which exited for a missing key. It ran under `--network none` and made zero provider requests. The final full suite uses the same standard `tests/` target as the rerun baseline; no test file was removed or newly skipped to obtain this result.

## 15. Full test result

**3407 passed, 1 skipped, 2 warnings in 20.69s**; **0 failures**. This is +286 passed tests over the rerun baseline.

The unchanged skip is opt-in `AI_AGENT_REDIS_INTEGRATION` in `test_agent_redis_integration.py`. Existing warnings: LangChain pending `allowed_objects` default change, and AnyIO `BlockingPortal` alias deprecation in the FastAPI/RAG smoke test. No new test skip or dependency-warning suppression was introduced. `git diff --check` passes.

## 16. Docker build result

After the ordered deterministic matrix and full suite passed:

```sh
docker compose build ai-service
docker compose up -d --no-deps ai-service
```

Both exited **0**. Only `avengers_ai_service` was recreated. Build image: `cnm-avengers-coffee-microservices-ai-ai-service:latest`; build manifest list `sha256:9ce1dd326afcbe1b2760c34272d1c9a565ce3a37d8dee2d0ea56583fcad67c12`. Logs: `/private/tmp/mapper-repair-build.log`, `/private/tmp/mapper-repair-recreate.log`.

Compose reported existing orphan containers; no orphan cleanup, down, volume removal, dependency recreation or DataPlatform action was performed.

## 17. Health and running-source verification

GET `http://127.0.0.1:8000/ai/health` from the recreated container returned **HTTP 200**. The health route reports local availability/state; it does not send an LLM request. No chat endpoint/UI/provider probe was executed.

SHA-256 of all six changed production modules in `/app` matched the tested worktree. Evidence is recorded in `SEMANTIC_MAPPER_REPAIR_RUNTIME.json`; verification output is `/private/tmp/mapper-runtime-check.json`.

## 18. Schema and exposed-function size comparison

Before = immutable registry from `62c3a6c`, measured against the same representative server states/capability inventory. After = current registry. Counts are semantic function declarations; chars are `len(json.dumps(..., ensure_ascii=False))`, not provider tokens or wire byte lengths. The system prompt grows from **5,025** to **5,219** chars to state per-operation reference permissions and neutral discovery ordering.

| State | Operations before → after | Schema chars before → after | System prompt chars before → after |
| --- | --- | --- | --- |
| browsing | 21 → 20 | 10,831 → 9,985 | 5,025 → 5,219 |
| products | 25 → 22 | 14,114 → 11,426 | 5,025 → 5,219 |
| pending_product | 26 → 25 | 14,859 → 13,980 | 5,025 → 5,219 |
| cart | 33 → 30 | 18,178 → 15,446 | 5,025 → 5,219 |
| voucher | 34 → 31 | 18,855 → 16,112 | 5,025 → 5,219 |
| location | 36 → 33 | 19,829 → 17,075 | 5,025 → 5,219 |
| payment_needed | 36 → 33 | 19,829 → 17,075 | 5,025 → 5,219 |
| summary | 38 → 35 | 20,559 → 17,805 | 5,025 → 5,219 |
| order_change | 38 → 35 | 22,384 → 19,619 | 5,025 → 5,219 |

Current all-48-operation worst-case schema: **26,912 chars**. The JSON also retains historical flat-union measurements and per-state context sizes. State exposure removes unnecessary shared-executor meanings; richer cart/checkout states still expose 30–35 operations to preserve natural interruptions. Exact schemas remain larger than the historical merged union; size reduction does not weaken required scope, reference identity, nested closure or business safety.

## 19. Remaining limitations and explicit acceptance answers

Offline scripts prove server/schema/repair behavior, not a real provider's Vietnamese understanding. No live language quality, real Menu contents, external geocoding, payment availability or production order service was qualified here. Root ad hoc provider diagnostic scripts are outside the deterministic `tests/` suite and were not used for live qualification. Rich states retain a relatively broad safe read surface; no additional text router or model classifier was added to reduce it.

| Question | Answer |
| --- | --- |
| Can DISCOVER_PRODUCTS without reference create pending MENU_CATEGORY? | **NO** |
| Can generic mapper create pending merely because namespace exists? | **NO** |
| Can CONFIGURE_PRODUCT still bind one unique pending product? | **YES** |
| Can malformed output before tool execution recover through a semantic call? | **YES**, within the same bounded turn |
| Can malformed output after a successful write replay that write? | **NO** |
| Can generic discovery silently become a price-ranking request? | **NO** |
| Can raw business tools appear in semantic production model declarations? | **NO**, only semantic_*; migration adapter remains unadvertised |
| Did any new regex become semantic authority? | **NO** |

Canonical identity/options, commitment checks, voucher gates, fulfillment/payment separation, saved-address confirmation, destination identity/coordinates, owned order previews, later confirmation, provider retry bounds, receipt idempotency and compound sibling preservation remain covered by the passing suite. No unconditional extra inference/classifier call was added. No real keys were printed, altered or supplied to qualification containers.

## 20. Manual human test matrix — prepared, NOT executed

Only the user should perform these against the real UI/provider after this repair. Wording is illustrative; none is a production routing rule. Inspect structural logs/state, not private keys or full prompts.

| # | Natural user goal / example | Expected state transition | Forbidden behavior | Log/state invariant |
| --- | --- | --- | --- | --- |
| 1 | “Trời lạnh, gợi ý đồ uống ngọt nhẹ giúp mình.” | Preference read in explicit drink scope, description-backed cards | Sales fallback, food leakage, unsupported suitability claim | RECOMMEND_BY_PREFERENCE; category=drink; preference concepts and approved description evidence; zero writes |
| 2 | After recommendations: “Đổi ý, mình muốn cà phê sữa.” | Canonical family discovery or exact Menu selection; old suggestions do not bind | Stale recommendation selection; pending-category clarification | DISCOVER_PRODUCTS has no reference unless a real category was selected; selection resolves Menu identity |
| 3 | “Cho xem các món trà.” | Broad family filter within explicit scope | Cheapest-first meaning, arbitrary selected product | filter_catalog search_text/family; sort_by=menu; zero writes |
| 4 | Choose one exact displayed drink by name or number | One canonical selected pending draft; all required options shown | Add cart immediately or silently authorize defaults | SELECT_PRODUCT/get_product_options SELECT; pending_products updated; no add_to_cart success |
| 5 | For that draft: “Size lớn, ít đá, ít ngọt.” | Unique pending PRODUCT configured with only supplied options | Bind stale focus, copy another drink's choices | CONFIGURE_PRODUCT pending PRODUCT; Menu option validation; canonical product_id; at most one cart write |
| 6 | “Lấy theo công thức mặc định của quán.” | Explicit defaults authorization for the unique pending drink | Defaults from selection/question alone; guessed default labels | USE_PRODUCT_DEFAULTS, current defaults evidence, Menu-owned defaults; one write |
| 7 | Select two drinks, then configure each independently | Two pending drafts; explicit references keep options separate | Arbitrarily bind implicit options to one of multiple drafts | PRODUCT ambiguity_count=2 when target omitted; explicit targets/options isolated; no unexpected write |
| 8 | “Bỏ dòng hai, dòng ba lấy ba ly, dòng đầu ít đá.” | Frozen entry-cart ordinals, sequential owned-line edits | Shift ordinals after removal; lose sibling; replay success during repair | SemanticPlan original_index/action_id retained; exact bound cart IDs; each successful edit once |
| 9 | “Giao tận nơi giúp mình.” | Fulfillment selected, location/saved-address gate pending | Silent COD/QR/wallet, automatic saved-address confirmation | SET_FULFILLMENT only; payment_method unchanged; address_confirmed remains false until actual selection |
| 10 | Supply destination, then choose one displayed map candidate | Persist exact canonical candidate destination and coordinates | Replace with profile address; resolve same candidate into a different place | candidate_id/provider_ref_id and confirmed_destination stable through later profile reads |
| 11 | Explicitly choose QR, COD, or wallet; separately ask what choices exist | Choice follows canonical inventory and wallet eligibility; question stays read-only | Payment inferred from delivery; unavailable wallet accepted | READ_PAYMENT_OPTIONS versus SET_PAYMENT; correct canonical payment enum; eligibility denial without write |
| 12 | Finish cart, decide voucher, supply checkout prerequisites, request summary, confirm later | Voucher gate → validated summary → later explicit confirmation → one order operation | Prepare+confirm in one turn, stale-summary acceptance, duplicate order on retry | Fresh prior-turn checkout_action_id/fingerprint; no place-order before affirmation; same client_message_id reuses receipt |

For any spontaneous formatting failure, also inspect `[AgentRepair]`: PRE_TOOL_RESPONSE_REPAIR must retain semantic tools; POST_TOOL_FINAL_ENVELOPE_REPAIR must show a zero-tool surface. Exhausted MODEL_PROTOCOL must not blame missing customer category/payment/target unless genuine business state establishes that clarification.

## 21. Live-provider accounting

**LIVE_PROVIDER_REQUESTS = 0**

All inference in qualification was scripted/fake in network-blocked containers. The only runtime HTTP verification was the local health endpoint. Real UI/provider tests are left for the user; no external LLM endpoint was called.
