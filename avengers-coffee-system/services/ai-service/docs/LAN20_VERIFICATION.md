# LAN20 migration — verification report

Date: 2026-10-02, Asia/Ho_Chi_Minh.

**Implementation present; deterministic regression green; real-model acceptance partial; authenticated E2E NOT RUN.**

## A. Actual starting branch / HEAD / remotes

Repository branch `branch_thaian` started clean at `a4c2b1bc5031792ed741e857ef30e16b3ba0ae95` (LAN19). `git fetch origin` succeeded with sandbox escalation. `origin/branch_thaian` was the same SHA; `origin/main` was `dc872e72ba29cac71b2395763a6776b7e6719f35`. These refs remain unchanged. No overlapping user edits or applicable AGENTS.md were found.

## B. Existing architecture call path before migration

`POST /ai/agent/chat` → authenticated/guest session authorization → Postgres conversation ownership and durable turn claim → server-scoped conversation ID → `agent_service.run_agent` → `order_flow_graph.run_order_flow` → deterministic language routing/graph → existing business tools/RAG → canonical response/UI → completed-turn/exchange persistence. HTTP concurrent/replay/unknown-outcome ownership remains in this path.

## C. Baseline test results

Before production edits: focused AI **930 passed**, full AI **1,704 passed**; one LangGraph warning each. Web **28 Node tests**, **3 Nearby groups**, **11 Checkout groups**, build passed. Order **11 suites / 108 tests**, build passed. `git diff --check` passed. Local Python also emitted its existing urllib3/LibreSSL warning.

## D. New architecture overview

The model chooses capabilities and arguments from current structured business state, recent conversation and bounded Redis hints. The guarded gateway validates proposals and calls existing authority. Tool artifacts generate canonical UI; validated text alone is rendered. Existing HTTP ownership and durable replay surround the new path. This is the customer ordering BPM only; no new autonomous/admin/staff process.

## E. LLM orchestrator implementation

Six new modules implement context, Redis memory, orchestration, capability registry, guarded policy and artifacts. `run_llm_tool_turn` reuses `groq_agent_chat`; no separate framework/heavy agent dependency was added. Read interruptions and multi-read composition are available. A narrowly named product-description capability delegates to the existing RAG authority. Provider/format failure never triggers legacy writes.

## F. Redis conversation memory design

Existing Redis, namespaced SHA-256 key of customer/conversation scope, default TTL **1,800 seconds** with refresh on save. Up to eight recent exchanges, sixteen products, five other-namespace candidates and eight tool summaries. Focus includes canonical product/cart-line/branch/voucher/location hints. Credential fields, JWT/Bearer values and runtime secret values are stripped. Cart/payment/order/replay truth is not stored here. Authorized reset clears both old and new conversation keys. Redis failure degrades gracefully.

## G. Context budget / recent-history design

Defaults: recent turns 8, initial context **12,000 chars**, memory **32,000 chars**, loop content **24,000 chars**, tool rounds 6, final output 600 tokens. History/snapshots are trimmed first. If a full cart cannot fit, it is omitted and marked unverified rather than partially represented as complete. Selected-product enrichment is re-budgeted. Calls are capped at four times the round budget; response repairs consume the same budget. Schemas are a fixed additional cost, measured below.

## H. Tool capability registry

**33 guarded capabilities**; all **27 legacy executors** audited. Access/risk, authority owner, preconditions, result shape and stage availability are recorded in `tool_capabilities.py` and [the capability audit](TOOL_CAPABILITY_AUDIT.md). Stage ANY permits proposals across customer stages subject to handler prerequisites. Completed-order cancel/update and permanent preference inference are excluded from the new ordering registry; retained in legacy mode.

## I. Tool guardrail/gateway design

Default-deny schema checks reject unknown fields, malformed types, nonpositive quantities, foreign ownership/price/session proposals and unsupported enums. Writes require authentication/current client turn and refreshed authoritative cart where applicable. Canonical IDs/options/price/eligibility/availability are checked through providers. Cart display indexes are distinct from product ordinals; a declared cart ordinal must agree with the exact current line ID. Branch commitment requires a candidate visible before the turn and fresh compatibility. No-op absolute edits do not write. This validates state and ownership; it cannot independently prove every natural-language interpretation by the model.

## J. RAG integration

Existing static/slow domains, authority filters, canonical product IDs and ingredient/allergen insufficiency remain intact. Sensitive ingredient/allergen questions also enforce approved evidence at output even when the model chooses a review tool. Product descriptions and generic knowledge use existing retrieval. Retrieved text is data, not instructions. Public knowledge responses conservatively use complete approved evidence; malformed model quotes are replaced with provider evidence. Compound knowledge+price responses append actual current price facts. RAG ingestion/storage was not rewritten.

## K. Business authority boundaries

Menu/options/price, Order/cart/quote, voucher, inventory, identity/geo and wallet services retain authority. Model prices, totals, ownership, coordinates and inventory are not accepted as truth. Redis is conversational context only. Current business state overrides conversational snapshots. Order Service, Web and their schemas/implementations are unchanged.

## L. UI artifact generation

Cards, cart and checkout UI come from current canonical tool rows. Optional model display selection may reorder/select only IDs from those rows, never invent card content. Namespace snapshots keep canonical display indexes and provider candidate IDs. Public results strip replay/authentication internals. Internal JSON envelope, provider details and memory are not rendered as reply text. Existing `reply`, `ui_payload`, `checkout_payload`, `conversation_state`, `error` and tool log contract is retained.

## M. Feature-flag modes

- `legacy`: existing graph; repository deployment default.
- `llm_tools`: guarded LLM path; explicitly enabled for local acceptance.
- `shadow`: one bounded blocked-tool diagnostic proposal; no new session mutation/Redis save; legacy alone generates the customer response.

The mode is selected before the turn. No automatic fallback after a possible write. Shadow still costs a provider call and is not a complete second simulation.

## N. Provider abstraction changes

Existing OpenAI-compatible loop/wrappers retained. Usage/model metadata are normalized, native JSON envelope mode forwarded, HTTP wrappers bounded by 30-second timeout, context/call budgets added, guarded executor TypeError retry removed, and provider errors logged by type. Provider attempts/failures, token totals and latency are measured. Legacy defaults keep their old call protocol. Three wrapper tests cover OpenAI, Gemini and OpenRouter normalization. The live configured model observed was `gpt-4o-mini-2024-07-18`; no vendor-specific business kernel was added.

## O. Idempotency / mutation safety

Existing durable client-message claims and processed-turn replay remain primary. Current-message conflicts are rejected. Stable mutation operation IDs reuse existing Order mutation context/reconciliation. Repeated signatures execute once; no-op patches preserve truth. Known writes survive final provider failure and replay without duplication. Unknown outcomes propagate to the HTTP unknown/reconciliation boundary; no second executor call or graph fallback.

## P. Final confirmation safety

Current explicit final confirmation still uses the existing critical confirmation classifier. The action must exist from a prior turn, belong to the current session, match pending confirmation, remain unexpired, and match current cart fingerprint. New same-turn summaries cannot authorize creation. Read/policy/price questions cannot confirm. Unchanged checkout choices preserve a fresh action; repeated summary rendering reuses it. Existing Order tools revalidate business acceptance.

## Q. Natural-language intelligence tests

**104 new deterministic cases** use scripted OpenAI-compatible proposals through the actual loop/gateway, without exact assistant-paragraph assertions or modifications to old tests. Canonical IDs, quantities, options, tool evidence, namespace ownership, UI counts and mutation outcomes are asserted. Real-model simulations separately test actual language understanding: **20/23 passed**, so model acceptance is **FAILED / partial**, detailed below.

## R. Catalog compositional tests

Scripted tests cover top-k cheapest, most expensive, compound min/max through two reads, generic food discovery, numeric price constraints, sixteen-row cap, canonical display selection and no fabricated cards. Real configured-model top-2, min/max and price-constraint examples passed in the final fixture matrix. Real HTTP top-2 and min/max against Menu authority passed; Macchiato belongs to the provider coffee category even though its display name does not contain the literal words “cà phê”.

## S. RAG interruption tests

Deterministic RAG interruptions preserve options, voucher, branch and final-confirmation owners. Unknown/insufficient evidence stays strict. A real privacy HTTP read returned approved policy text. The final model fixture incorrectly routed a taste follow-up during options to reviews; this semantic failure is not hidden by the green deterministic results.

## T. Cart/options/edit tests

Canonical option validation, staged quantity preservation, defaults, multi-selection/cancellation, replacement, exact edits/removals, unknown option rejection, current provider price, replay and conflict checks pass. Ordinal/line-ID disagreement is blocked; unchanged patches avoid writes. The real model fixture still targeted the second owned cart row for a first-row topping request, declaring ordinal 2 consistently with that ID. Ownership checks passed but the interpretation was wrong; cart semantic acceptance is not green.

## U. Voucher tests

Fresh eligibility before application, forged/stale code rejection, exactly-once application, removing an applied voucher when skipping, finish-cart voucher gate and mandatory decision before checkout pass. Existing voucher negation source is unchanged. The final real-model fixture passed finish/skip/fulfillment progression. No new voucher phrase patch.

## V. Location/branch tests

Unavailable/unverified/unknown branch commits are blocked; current canonical branch selection revalidates cart compatibility. A just-discovered branch cannot be selected automatically in the same turn. Existing geo adapter reuses immutable provider coordinates, and selected complete delivery candidates promote active address/branch without re-geocoding. Fulfillment selection activates the checkout location path. Namespace/foreign target rejection passes. Live authenticated delivery acceptance remains unrun.

## W. Checkout/payment tests

Missing voucher/fulfillment/payment/branch/address prerequisites produce structured failures. Wallet selection requires fresh eligibility. Fulfillment/payment changes invalidate dependent summaries; unchanged choices do not. Summary reuse, read interruption, expired/foreign/stale action denial, same-turn creation denial and exactly-once final confirmation pass. Real model fixture summary, re-render, payment information and confirmation passed with a simulated order only.

## X. Redis tests

Fake TTL/scope/reset/bounds/outage/secret tests pass. The existing Redis also passed explicit random-key SET/TTL/expiry/reset testing and unavailable-client degradation. Canonical payment code/ordinal and branch ordinal survive bounded snapshots; wallet balances are omitted from memory. Full container regression includes this integration test.

## Y. Focused test result

Final focused AI: **1,034 passed**, one LangGraph warning, **8.61 seconds**. Nineteen baseline business suites plus three new deterministic files. Old passing tests were not edited or weakened.

## Z. Full AI result

Local final `pytest -q tests`: **1,808 passed, 1 skipped**, one LangGraph warning, **11.72 seconds**; skipped test is the opt-in real Redis check, separately run in Docker. Final container full suite: **1,809 passed**, two warnings, **10.58 seconds**. Existing shared-contract fixture was copied into its expected repository-relative layout in `/tmp`; test-only environment disabled live provider/DB endpoints and selected test environment, while real Redis remained enabled. Earlier attempts exposed fixture-layout/environment assumptions and were corrected without editing existing tests.

## AA. Web regression/build

**28 Node tests**, **3 Nearby groups**, **11 Checkout groups**, all passed; Vite build passed (**3.36 seconds**). Existing null-input/Browserslist/chunk-size notices remain. No frontend edits.

## AB. Order regression/build

**11 suites / 108 tests passed**, build exit 0. Localhost-binding escalation was used for HTTP tests. No Order source edits.

## AC. Runtime/Docker/Redis verification

Only AI was rebuilt/recreated using `AI_CHAT_ORCHESTRATOR_MODE=llm_tools docker compose up -d --no-deps --build ai-service`. Existing Redis is reused. Final container `dd9c91c78de547689f4143428aef3d8f4a85cad541741c6db320ba2a69dff2bd`; image `sha256:72b2d1e092f3956a7c615b78dd0297566032de02c2bbbf61ef308a6b6ed209d9`; started `2026-10-01T20:27:07.151469544Z`; no source mounts. All **54 src Python modules plus main.py match checkout bytes**. `/ai/health` HTTP **200** through port 3000 gateway. Runtime mode **llm_tools**, TTL **1800**, Redis **PONG**. Initial container had 48 modules matching LAN19; this is a new source-consistent runtime, not stale evidence.

## AD. Live E2E result

- **NOT RUN:** authenticated external three-scenario customer journey. `E2E_EMAIL` and `E2E_PASSWORD` absent locally and in AI runtime. External harness unchanged.
- **PASSED:** three real guest HTTP read smokes (catalog top-2, coffee min/max, privacy RAG), verified by tool traces/canonical artifacts rather than status alone.
- **FAILED / partial:** configured-model isolated fixture matrix, **20 of 23** semantic checks passed. This is a real model with mocked business authority, not authenticated E2E.

Final failed checks:

- **generic-food**: generic food browse went to product review/description and returned insufficient information instead of catalog candidates.
- **rag-interruption**: taste question during options went to review ratings instead of RAG evidence.
- **edit-topping**: first-row edit changed the second owned row; declared ordinal/ID agreed with each other but not customer intent.

No authenticated harness order was created. Demo confirmation creates only an in-memory simulated order. Guest smokes create isolated AI conversation/turn fixtures.

## AE. Token/context measurements

Measured final fixture run: system prompt **4,525 chars**, safe schemas **13,253 chars**. Median input across tested turns **7,126 tokens**, max initial context **4,065 chars**, max provider requests per turn **6**. Usage below sums provider requests within each turn and includes full registry cost. The first version keeps the safe registry available for compositional reads/interruptions; it is bounded but not cheap. No monetary projection. Fixture timing excludes real business-service network latency.

| Turn | Context chars | History chars | Memory chars | Input tokens | Output tokens | Tool rounds | Requests | Latency ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| top2 | 1549 | 236 | 1166 | 6317 | 164 | 1 | 2 | 4118.65 |
| description | 2298 | 791 | 2012 | 6748 | 65 | 1 | 2 | 2659.35 |
| complete-options | 2646 | 1008 | 2359 | 7033 | 138 | 1 | 2 | 3152.26 |
| summary | 3903 | 1432 | 3301 | 7549 | 99 | 1 | 2 | 3484.89 |
| confirm | 4037 | 1477 | 3304 | 7595 | 99 | 1 | 2 | 2836.59 |

## AF. Hardcoding audit

New production modules contain no demo products, coordinates, IDs, exact task sentences or customer-location branches. Synthetic data/utterances exist only in tests and temporary isolated demos. No new Vietnamese user-routing phrase bank; the primary new path is LLM-driven. Narrow response-claim checks, existing authority filters, canonical normalization and final-confirmation safety remain deterministic. `git diff --check` and new-source whitespace checks pass.

## AG. Files changed

Six tracked files: `.env.example`, `docker-compose.yml`, AI `main.py`, `requirements.txt`, `agent_service.py`, `groq_service.py`. Six new production modules: `agent_context.py`, `agent_memory.py`, `llm_tool_orchestrator.py`, `tool_artifacts.py`, `tool_capabilities.py`, `tool_policy.py`. Four new tests: Redis memory/integration, guarded gateway, LLM orchestrator. Three service docs: architecture, capability audit, this verification report. No root-level report. Temporary scripts/results remain under `/tmp`.

## AH. Legacy modules retained

`order_flow_graph.py`, `tier1.py`, `shopping_language.py`, `selection_language.py`, `pending_context.py` and existing tools/RAG remain intact. Used for rollback/regression and narrowly reused deterministic transaction/location/confirmation helpers. They are not the primary language router in llm_tools. No giant removal/refactor.

## AI. Residual risks

The three real-model semantic failures above remain unresolved; do not treat this as fully accepted customer rollout. Exact owned-ID validation does not independently validate all model interpretations of human intent. Real authenticated three-scenario ordering, delivery, wallet and final-order acceptance are outstanding. RAG responses conservatively quote provider evidence, limiting paraphrase flexibility. Full registry and occasional repair rounds incur measured cost. Shadow is proposal-only. Editing and additionally adding the same product in one turn is blocked conservatively and can require a separate turn. Configured Gemini/Groq fallbacks were not separately live-qualified; normalized wrapper/kernel tests cover their shared contracts. Deployment default remains legacy; local runtime is explicitly llm_tools.

## AJ. Exact git status

```text
 M .env.example
 M avengers-coffee-system/services/ai-service/main.py
 M avengers-coffee-system/services/ai-service/requirements.txt
 M avengers-coffee-system/services/ai-service/src/agents/agent_service.py
 M avengers-coffee-system/services/ai-service/src/common/groq_service.py
 M docker-compose.yml
?? avengers-coffee-system/services/ai-service/docs/LAN20_VERIFICATION.md
?? avengers-coffee-system/services/ai-service/docs/LLM_TOOL_ORCHESTRATOR.md
?? avengers-coffee-system/services/ai-service/docs/TOOL_CAPABILITY_AUDIT.md
?? avengers-coffee-system/services/ai-service/src/agents/agent_context.py
?? avengers-coffee-system/services/ai-service/src/agents/agent_memory.py
?? avengers-coffee-system/services/ai-service/src/agents/llm_tool_orchestrator.py
?? avengers-coffee-system/services/ai-service/src/agents/tool_artifacts.py
?? avengers-coffee-system/services/ai-service/src/agents/tool_capabilities.py
?? avengers-coffee-system/services/ai-service/src/agents/tool_policy.py
?? avengers-coffee-system/services/ai-service/tests/test_agent_redis_integration.py
?? avengers-coffee-system/services/ai-service/tests/test_agent_redis_memory.py
?? avengers-coffee-system/services/ai-service/tests/test_guarded_tool_gateway.py
?? avengers-coffee-system/services/ai-service/tests/test_llm_tool_orchestrator.py
```

HEAD/remotes unchanged; no files staged. Six tracked modifications and thirteen untracked files, all listed above.

## AK. Explicit confirmation

**NO COMMIT PERFORMED**

**NO PUSH PERFORMED**

No pull, merge, rebase, reset, clean or staging performed.
